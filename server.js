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

// Build a prompt for a SINGLE covering type - 1 vehicle, 1 image
function buildSinglePrompt(coveringType, vehicle_type, vehicle_category, brand_name, main_text, key_info, industry, style, primary_colors, constraints, logoFile, logoUrl) {
    const coveringDesc = {
        'Standard': 'STANDARD (Lettrage / Marquage simple) : Le vehicule GARDE sa couleur d\'origine intacte. Seuls le nom de marque, le slogan, les coordonnees et le logo sont appliques en lettrage vinyle decoupe sur le flanc lateral (PAS sur les vitres). Aucun fond colore, aucun covering de surface. Juste du lettrage propre et lisible sur la carrosserie d\'origine. La peinture d\'origine du vehicule reste 100% visible.',
        'Semi-cover': 'SEMI-COVER (Covering partiel) : La couleur et les graphismes du design recouvrent environ 40 a 60% de la surface laterale du vehicule (par exemple la moitie basse, ou de la porte avant jusqu\'a l\'arriere). Le reste de la carrosserie reste dans la couleur d\'origine du vehicule. Le nom de marque, slogan et coordonnees sont integres dans la zone couverte.',
        'Full cover': 'FULL COVER (Total covering) : La couleur et le design recouvrent la TOTALITE de la carrosserie visible (capot, flancs, portes, hayon) SAUF les vitres et les pare-chocs. Le vehicule entier est transforme aux couleurs de la marque. Le nom, slogan et coordonnees sont integres dans le design global.'
    };

    let logoInstruction = 'Pas de logo fourni. Utilise une typographie soignee et elegante pour afficher le nom de marque sur le vehicule.';
    if (logoFile) {
        if (logoUrl) {
            logoInstruction = 'Logo fourni : OUI. Le logo DOIT apparaitre sur l\'image, bien visible et fidele a l\'original. Place le logo sur le vehicule de maniere professionnelle (sur la portiere, le capot ou le flanc). Ne modifie PAS le logo. REPRODUIS-LE A L\'IDENTIQUE.';
        } else {
            logoInstruction = 'Logo fourni mais echec upload. Utilise une typographie soignee pour le nom de marque a la place du logo.';
        }
    }

    return `
Tu es un designer expert en covering et lettrage de vehicules commerciaux.
Genere UNE SEULE IMAGE contenant UN SEUL vehicule.

=== VEHICULE ===
Modele EXACT : ${vehicle_type}
Categorie : ${vehicle_category}
Le vehicule DOIT etre un "${vehicle_type}" exact. Respecte sa silhouette, proportions, phares, calandre et lignes specifiques.

=== VUE ===
VUE LATERALE DE PROFIL uniquement (cote gauche ou droit).
On voit tout le flanc lateral, des roues avant aux roues arriere.
PAS de vue de face, PAS de vue 3/4, PAS de vue arriere. PROFIL LATERAL PUR.
Fond neutre (studio gris clair ou parking propre). Le vehicule EN ENTIER dans le cadre avec des marges.

=== TYPE DE COVERING : ${coveringType} ===
${coveringDesc[coveringType] || coveringDesc['Standard']}

=== MARQUE & TEXTE ===
Nom de marque : "${brand_name}"
Slogan / texte principal : "${main_text}"
Informations (tel, site, etc.) : "${key_info}"
Secteur d'activite : ${industry}
N'affiche QUE les textes fournis. N'invente AUCUN texte. Si un champ est vide, ne l'affiche pas.

=== STYLE & COULEURS ===
Style graphique : ${style}
Couleurs principales : ${primary_colors}

=== LOGO ===
${logoInstruction}

=== CONTRAINTES ===
${constraints || 'Aucune contrainte specifique.'}

=== FORMAT (CRITIQUE) ===
- UNE SEULE IMAGE avec UN SEUL vehicule "${vehicle_type}".
- PAS 2 vehicules, PAS 3. UN SEUL vehicule sur l'image.
- PAS de collage, PAS de mosaique, PAS de split-screen.
- Vehicule COMPLET non coupe, de la calandre au pare-chocs arriere.
- VUE DE PROFIL LATERAL uniquement.
- Ratio 1:1. Rendu photorealiste haute qualite.
`;
}

// Submit a generation request and poll until result
async function generateSingleImage(prompt, logoUrl, apiKey, apiBaseUrl, label) {
    console.log(`[${label}] Sending generation request...`);

    const requestBody = {
        prompt: prompt,
        size: "1:1",
        nVariants: 1
    };
    if (logoUrl) {
        requestBody.filesUrl = [logoUrl];
    }

    const generateResponse = await fetch(`${apiBaseUrl}/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    const genData = await generateResponse.json();
    console.log(`[${label}] RAW Response:`, JSON.stringify(genData, null, 2));

    if (!generateResponse.ok || (genData.code && genData.code !== 200)) {
        throw new Error(`API Error for ${label}: ${genData.msg || genData.message || 'Unknown'} (Code: ${genData.code})`);
    }

    const taskId = genData.data?.taskId || genData.taskId;

    if (!taskId) {
        // Check for direct/sync images
        if (genData.data && Array.isArray(genData.data) && genData.data[0]?.url) {
            return genData.data[0].url;
        }
        if (genData.data?.url) {
            return genData.data.url;
        }
        throw new Error(`No taskId for ${label}: ${JSON.stringify(genData)}`);
    }

    // Poll for results (60 attempts x 5s = up to 5 minutes)
    console.log(`[${label}] Task ID: ${taskId}. Polling...`);
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));

        const statusResponse = await fetch(`${apiBaseUrl}/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!statusResponse.ok) {
            console.warn(`[${label}] Polling failed: ${statusResponse.status}`);
            attempts++;
            continue;
        }

        const statusData = await statusResponse.json();
        const successFlag = statusData?.data?.successFlag;
        const progress = statusData?.data?.progress || "0";
        console.log(`[${label}] Poll ${attempts + 1}/${maxAttempts}: flag=${successFlag}, progress=${progress}`);

        if (statusData.code === 200 && statusData.data && successFlag === 1) {
            const response = statusData.data.response;
            const resultUrls = response?.resultUrls || response?.result_urls || [];
            if (resultUrls.length > 0) {
                console.log(`[${label}] SUCCESS - Got image: ${resultUrls[0]}`);
                return resultUrls[0];
            }
            throw new Error(`${label} succeeded but no images returned`);
        }

        if (successFlag === 2) {
            const failureReason = statusData.data?.errorMessage || statusData.data?.failMsg || "Unknown";
            throw new Error(`${label} failed: ${failureReason}`);
        }

        attempts++;
    }

    throw new Error(`${label} timed out after 5 minutes`);
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

        // Upload logo BEFORE building prompts
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

        // Build 3 separate prompts (1 per covering type)
        const promptArgs = [vehicle_type, vehicle_category, brand_name, main_text, key_info, industry, style, primary_colors, constraints, logoFile, logoUrl];
        const prompt1 = buildSinglePrompt(chosenType, ...promptArgs);
        const prompt2 = buildSinglePrompt(otherTypes[0], ...promptArgs);
        const prompt3 = buildSinglePrompt(otherTypes[1], ...promptArgs);

        console.log(`=== Starting 3 separate generations ===`);
        console.log(`1. ${chosenType} (chosen)`);
        console.log(`2. ${otherTypes[0]} (alternative)`);
        console.log(`3. ${otherTypes[1]} (alternative)`);

        // Step 1: Generate the CHOSEN type first
        const chosenImage = await generateSingleImage(prompt1, logoUrl, KIE_API_KEY, API_BASE_URL, chosenType);

        // Step 2: Generate the 2 alternatives in parallel
        const [altImage1, altImage2] = await Promise.all([
            generateSingleImage(prompt2, logoUrl, KIE_API_KEY, API_BASE_URL, otherTypes[0]),
            generateSingleImage(prompt3, logoUrl, KIE_API_KEY, API_BASE_URL, otherTypes[1])
        ]);

        console.log(`=== All 3 generations complete ===`);

        return res.json({
            success: true,
            images: [chosenImage, altImage1, altImage2],
            logoUsed: !!logoUrl,
            logoError: logoUploadError || null,
            chosenType: chosenType,
            otherTypes: otherTypes
        });

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
