const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Multer config for logo upload (in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Helper: Upload logo to Kie.ai File Upload API and get a public URL
async function uploadLogoToKie(fileBuffer, fileName, apiKey) {
    const base64Raw = fileBuffer.toString('base64');
    const ext = path.extname(fileName).slice(1).toLowerCase() || 'png';
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const dataUrl = `data:${mimeType};base64,${base64Raw}`;

    console.log(`[LOGO] Uploading to Kie.ai (${fileName}, ${(fileBuffer.length / 1024).toFixed(1)} KB, ext=${ext})...`);

    // Try with data URL format first
    let uploadResponse = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            base64Data: dataUrl,
            uploadPath: 'logos',
            fileName: `logo-${Date.now()}.${ext}`
        })
    });
    let uploadData = await uploadResponse.json();
    console.log('[LOGO] Upload response (dataUrl):', JSON.stringify(uploadData, null, 2));

    // If data URL format failed, try raw base64
    if (!uploadResponse.ok || uploadData.code !== 200) {
        console.log('[LOGO] Data URL format failed, trying raw base64...');
        uploadResponse = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                base64Data: base64Raw,
                uploadPath: 'logos',
                fileName: `logo-${Date.now()}.${ext}`
            })
        });
        uploadData = await uploadResponse.json();
        console.log('[LOGO] Upload response (raw):', JSON.stringify(uploadData, null, 2));
    }

    if (!uploadResponse.ok || (uploadData.code && uploadData.code !== 200)) {
        throw new Error(`Logo upload failed: ${uploadData.msg || JSON.stringify(uploadData)}`);
    }

    // API returns fileUrl or downloadUrl at different levels
    const d = uploadData.data || uploadData;
    const fileUrl = d.fileUrl || d.downloadUrl || d.url;
    if (!fileUrl) {
        throw new Error(`Logo upload returned no URL: ${JSON.stringify(d)}`);
    }
    return fileUrl;
}

app.post('/api/generate', upload.single('logo_file'), async (req, res) => {
    try {
        const {
            vehicle_type, vehicle_category, coverage_type,
            industry, brand_name, main_text, key_info, style, primary_colors, constraints
        } = req.body;
        const logoFile = req.file;

        const allTypes = ['Standard', 'Semi-cover', 'Full cover'];
        const chosenType = coverage_type || 'Standard';
        const otherTypes = allTypes.filter(t => t !== chosenType);

        const KIE_API_KEY = process.env.KIE_API_KEY;
        const API_BASE_URL = 'https://api.kie.ai/api/v1/gpt4o-image';

        if (!KIE_API_KEY || KIE_API_KEY.trim() === '') {
            console.warn("No KIE_API_KEY found (or empty). Switching to MOCK MODE.");
            const mockImages = [
                "https://placehold.co/1024x768/000000/d4af37?text=" + encodeURIComponent(chosenType),
                "https://placehold.co/1024x768/1a1a1a/ffffff?text=" + encodeURIComponent(otherTypes[0]),
                "https://placehold.co/1024x768/333333/d4af37?text=" + encodeURIComponent(otherTypes[1])
            ];
            await new Promise(resolve => setTimeout(resolve, 2000));
            return res.json({ success: true, images: mockImages, chosenType, otherTypes });
        }

        // Upload logo BEFORE building prompt so logoUrl is available
        let logoUrl = null;
        let logoUploadError = null;
        if (logoFile) {
            try {
                logoUrl = await uploadLogoToKie(logoFile.buffer, logoFile.originalname, KIE_API_KEY);
                console.log(`[LOGO] SUCCESS - URL: ${logoUrl}`);
            } catch (uploadErr) {
                logoUploadError = uploadErr.message;
                console.error('[LOGO] FAILED:', uploadErr.message);
            }
        } else {
            console.log('[LOGO] No logo file received from form');
        }

        // Construct the ultra-precise prompt
        const prompt = `
IMPORTANT: Tu dois suivre EXACTEMENT les instructions ci-dessous. Ne modifie rien, n'invente rien.

Tu es un designer expert en covering et lettrage de vehicules commerciaux.

=== VEHICULE (respecter le modele EXACT) ===
Modele EXACT : ${vehicle_type}
Categorie : ${vehicle_category}
REGLE ABSOLUE : Le vehicule DOIT etre un "${vehicle_type}" exact. Respecte sa silhouette, proportions, phares, calandre et lignes specifiques.

=== VUE (CRITIQUE) ===
Vue OBLIGATOIRE : VUE LATERALE DE PROFIL (cote gauche ou droit du vehicule).
On doit voir UNIQUEMENT le PROFIL du vehicule : tout le flanc lateral, des roues avant aux roues arriere.
NE MONTRE PAS le capot de face. NE MONTRE PAS la vue 3/4. UNIQUEMENT le profil lateral pur, comme une photo prise exactement perpendiculairement au cote du vehicule.
Fond neutre (studio gris clair ou parking propre). Le vehicule EN ENTIER dans le cadre avec des marges.

=== REGLE ABSOLUE : 1 SEUL VEHICULE PAR IMAGE ===
Chaque image generee contient EXACTEMENT 1 seul vehicule. Jamais 2, jamais 3. UNE SEULE voiture par image.

=== GENERATION DE 3 VARIANTES (ORDRE OBLIGATOIRE) ===
Tu vas generer exactement 3 images. Chaque image montre le MEME vehicule "${vehicle_type}" en VUE DE PROFIL LATERALE, avec un TYPE DE COVERING DIFFERENT.
L'ORDRE EST CRUCIAL : IMAGE 1 = le choix du client, IMAGE 2 et 3 = les alternatives.

IMAGE 1 (PRIORITAIRE - choix du client) : TYPE "${chosenType}"
${chosenType === 'Standard' ? 'STANDARD (Lettrage / Marquage simple) : Le vehicule GARDE sa couleur d\'origine intacte. Seuls le nom de marque, le slogan, les coordonnees et le logo sont appliques en lettrage vinyle decoupe sur le flanc lateral (PAS sur les vitres). Aucun fond colore, aucun covering de surface. Juste du lettrage propre et lisible sur la carrosserie d\'origine.' : ''}${chosenType === 'Semi-cover' ? 'SEMI-COVER (Covering partiel) : La couleur et les graphismes du design recouvrent environ 40 a 60% de la surface laterale du vehicule (par exemple la moitie basse, ou de la porte avant jusqu\'a l\'arriere). Le reste de la carrosserie reste dans la couleur d\'origine. Le nom de marque, slogan et coordonnees sont integres dans la zone couverte.' : ''}${chosenType === 'Full cover' ? 'FULL COVER (Total covering) : La couleur et le design recouvrent la TOTALITE de la carrosserie visible (capot, flancs, portes, hayon) SAUF les vitres et les pare-chocs. Le vehicule entier est transforme aux couleurs de la marque. Le nom, slogan et coordonnees sont integres dans le design global.' : ''}

IMAGE 2 : TYPE "${otherTypes[0]}" (alternative)
${otherTypes[0] === 'Standard' ? 'STANDARD (Lettrage) : Vehicule couleur d\'origine + lettrage/marquage seul (pas de fond colore, pas de covering).' : ''}${otherTypes[0] === 'Semi-cover' ? 'SEMI-COVER : Couleur et graphismes sur environ la moitie du profil lateral, autre moitie couleur d\'origine.' : ''}${otherTypes[0] === 'Full cover' ? 'FULL COVER : Couleur et design sur toute la carrosserie visible (sauf vitres).' : ''}

IMAGE 3 : TYPE "${otherTypes[1]}" (alternative)
${otherTypes[1] === 'Standard' ? 'STANDARD (Lettrage) : Vehicule couleur d\'origine + lettrage/marquage seul (pas de fond colore, pas de covering).' : ''}${otherTypes[1] === 'Semi-cover' ? 'SEMI-COVER : Couleur et graphismes sur environ la moitie du profil lateral, autre moitie couleur d\'origine.' : ''}${otherTypes[1] === 'Full cover' ? 'FULL COVER : Couleur et design sur toute la carrosserie visible (sauf vitres).' : ''}

CHAQUE IMAGE DOIT ETRE VISUELLEMENT DIFFERENTE en termes de surface couverte par le design.

=== MARQUE & TEXTE (NE RIEN INVENTER) ===
Nom de marque : "${brand_name}"
Slogan / texte principal : "${main_text}"
Informations (tel, site, etc.) : "${key_info}"
Secteur d'activite : ${industry}
REGLE : N'affiche QUE les textes fournis. N'invente AUCUN texte supplementaire. Si un champ est vide, ne l'affiche pas.

=== STYLE & COULEURS ===
Style graphique : ${style}
Couleurs principales : ${primary_colors}
Hierarchie visuelle claire. Lisibilite a distance.

=== LOGO (TRES IMPORTANT) ===
${logoFile ? (logoUrl ? 'Logo fourni : OUI. Le logo DOIT apparaitre sur CHACUNE des 3 images, bien visible et fidele a l\'original. Place le logo sur chaque vehicule de maniere professionnelle (sur la portiere, le capot ou le flanc). Ne modifie PAS le logo. REPRODUIS-LE A L\'IDENTIQUE sur les 3 variantes.' : 'Logo fourni mais echec upload. Utilise une typographie soignee pour le nom de marque a la place du logo.') : 'Pas de logo fourni. Utilise une typographie soignee et elegante pour afficher le nom de marque sur le vehicule.'}

=== CONTRAINTES ===
${constraints || 'Aucune contrainte specifique.'}

=== FORMAT DE CHAQUE IMAGE (CRITIQUE - RESPECTER A LA LETTRE) ===
- EXACTEMENT 1 SEUL vehicule "${vehicle_type}" par image. PAS 2, PAS 3. UN SEUL.
- Le vehicule est COMPLET et non coupe. On voit tout : de la calandre au pare-chocs arriere.
- VUE DE PROFIL LATERAL uniquement (perpendiculaire au flanc du vehicule).
- PAS de vue de face, PAS de vue 3/4, PAS de vue arriere. PROFIL LATERAL PUR.
- PAS de collage, PAS de mosaique, PAS de split-screen, PAS de plusieurs vehicules.
- Fond neutre. Marges suffisantes autour du vehicule. Ratio 1:1.
- Rendu photorealiste haute qualite.
- Les 3 images doivent montrer des niveaux de couverture CLAIREMENT differents les uns des autres.
`;

        console.log("Generated Prompt:", prompt);

        // Send generation request
        console.log(`Sending request to Kie.ai (${API_BASE_URL})...`);

        const requestBody = {
            prompt: prompt,
            size: "1:1",
            nVariants: 4
        };
        if (logoUrl) {
            requestBody.filesUrl = [logoUrl];
        }

        const generateResponse = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIE_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        const genData = await generateResponse.json();
        console.log("Kie.ai RAW Response:", JSON.stringify(genData, null, 2));

        if (!generateResponse.ok || (genData.code && genData.code !== 200)) {
            console.error("Kie.ai API Error:", genData);
            const errorMsg = genData.msg || genData.message || "Unknown error from AI provider";
            return res.status(500).json({ success: false, error: `AI Provider Error: ${errorMsg} (Code: ${genData.code})` });
        }

        // Extract taskId for async polling
        const taskId = genData.data?.taskId || genData.taskId;

        if (!taskId) {
            // Check for direct/sync images
            if (genData.data && Array.isArray(genData.data) && genData.data[0].url) {
                return res.json({ success: true, images: genData.data.map(img => img.url) });
            }
            if (genData.data && genData.data.url) {
                return res.json({ success: true, images: [genData.data.url] });
            }
            console.error("Unknown API Response Structure:", JSON.stringify(genData, null, 2));
            return res.status(500).json({ success: false, error: "Invalid response from AI provider (No taskId found)" });
        }

        // Poll for results (60 attempts x 5s = up to 5 minutes)
        console.log(`Task ID received: ${taskId}. Polling for results...`);
        let attempts = 0;
        const maxAttempts = 60;

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 5000));

            const statusResponse = await fetch(`${API_BASE_URL}/record-info?taskId=${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
            });

            if (!statusResponse.ok) {
                console.warn(`Polling request failed: ${statusResponse.status}`);
                attempts++;
                continue;
            }

            const statusData = await statusResponse.json();
            const successFlag = statusData?.data?.successFlag;
            const progress = statusData?.data?.progress || "0";
            console.log(`Polling attempt ${attempts + 1}/${maxAttempts}: successFlag=${successFlag}, progress=${progress}`);

            if (statusData.code === 200 && statusData.data && successFlag === 1) {
                // Success: extract image URLs
                const response = statusData.data.response;
                const resultUrls = response?.resultUrls || response?.result_urls || [];
                if (resultUrls.length > 0) {
                    // Only return first 3 images (1 chosen + 2 alternatives)
                    return res.json({ 
                        success: true, 
                        images: resultUrls.slice(0, 3),
                        logoUsed: !!logoUrl,
                        logoError: logoUploadError || null,
                        chosenType: chosenType,
                        otherTypes: otherTypes
                    });
                }
                console.warn("Success but no resultUrls found:", JSON.stringify(statusData.data, null, 2));
                return res.status(500).json({ success: false, error: "Generation succeeded but no images returned" });
            }

            if (successFlag === 2) {
                // Task failed
                console.error("Task Failed Details:", JSON.stringify(statusData, null, 2));
                const failureReason = statusData.data.errorMessage || statusData.data.failMsg || "Unknown error from AI provider";
                return res.status(500).json({ success: false, error: `AI Failed: ${failureReason}` });
            }

            attempts++;
        }

        return res.status(504).json({ success: false, error: "Timeout waiting for generations" });

    } catch (error) {
        console.error("Server Exception:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
