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
    const base64Data = fileBuffer.toString('base64');
    const ext = path.extname(fileName).slice(1) || 'png';
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    console.log(`Uploading logo to Kie.ai (${fileName}, ${(fileBuffer.length / 1024).toFixed(1)} KB)...`);
    const uploadResponse = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
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
    const uploadData = await uploadResponse.json();
    console.log('Upload response:', JSON.stringify(uploadData, null, 2));
    if (!uploadResponse.ok || uploadData.code !== 200) {
        throw new Error(`Logo upload failed: ${uploadData.msg || 'Unknown error'}`);
    }
    return uploadData.data.fileUrl;
}

app.post('/api/generate', upload.single('logo_file'), async (req, res) => {
    try {
        const {
            vehicle_type, coverage_zones, vehicle_category, coverage_type,
            industry, brand_name, main_text, key_info, style, primary_colors, constraints
        } = req.body;
        const logoFile = req.file;
        const vehicle_view = 'Vue 3/4 avant';

        // Construct the ultra-precise prompt
        const prompt = `
IMPORTANT: Tu dois suivre EXACTEMENT les instructions ci-dessous. Ne modifie rien, n'invente rien.

Tu es un designer expert en covering et lettrage de vehicules commerciaux. Tu vas generer UNE SEULE IMAGE photorealiste d'un vehicule avec un design de covering/lettrage applique.

=== VEHICULE (OBLIGATOIRE - respecter le modele EXACT) ===
Modele EXACT du vehicule : ${vehicle_type}
Categorie : ${vehicle_category}
REGLE ABSOLUE : Le vehicule affiche DOIT etre un "${vehicle_type}". Pas un autre modele, pas une version generique. Respecte la silhouette, les proportions, les phares, la calandre et les lignes exactes de ce modele precis.

=== VUE & CADRAGE ===
Vue demandee : ${vehicle_view}
Le vehicule doit etre montre EN ENTIER depuis cette vue exacte, sur un fond neutre (studio ou parking propre). Aucun recadrage partiel.

=== TYPE DE RECOUVREMENT ===
Type : ${coverage_type}
Zones a couvrir : ${coverage_zones || 'Selon le type de recouvrement choisi'}
- Si "Full cover" : tout le vehicule est recouvert (sauf vitres).
- Si "Semi-cover" : certaines zones restent dans la couleur d'origine.
- Si "Marquage simple" : lettrage et elements graphiques uniquement, pas de fond colore.

=== MARQUE & TEXTE (NE RIEN INVENTER) ===
Nom de marque : "${brand_name}"
Slogan / texte principal : "${main_text}"
Informations (tel, site, etc.) : "${key_info}"
Secteur d'activite : ${industry}
REGLE ABSOLUE : N'affiche QUE les textes fournis ci-dessus. N'invente AUCUN numero de telephone, AUCUNE adresse, AUCUN slogan, AUCUN site web qui ne figure pas dans les champs ci-dessus. Si un champ est vide, ne l'affiche pas.

=== STYLE & COULEURS ===
Style graphique : ${style}
Couleurs principales : ${primary_colors}
Le design doit refleter le secteur "${industry}" tout en respectant le style demande. Hierarchie visuelle claire. Lisibilite a distance (texte principal > infos secondaires).

=== LOGO ===
Logo fourni : ${logoFile ? 'OUI - utilise le logo fourni en piece jointe comme reference exacte et integre-le dans le design.' : 'NON - utilise uniquement une typographie soignee pour le nom de marque.'}

=== CONTRAINTES ===
${constraints || 'Aucune contrainte specifique.'}
Regles supplementaires : Pas de details trop fins non imprimables. Pas de texte flou ou illisible.

=== FORMAT DE SORTIE (CRITIQUE) ===
- Genere exactement UNE image.
- L'image montre UN SEUL vehicule "${vehicle_type}" complet, vu en "${vehicle_view}".
- Le design de covering/lettrage est applique de maniere photorealiste sur le vehicule.
- PAS de collage, PAS de mosaique, PAS de split-screen, PAS de texte flottant en dehors du vehicule.
- Rendu final : mockup professionnel haute qualite, pret a presenter a un client.
`;

        console.log("Generated Prompt:", prompt);

        const KIE_API_KEY = process.env.KIE_API_KEY;
        const API_BASE_URL = 'https://api.kie.ai/api/v1/gpt4o-image';

        if (!KIE_API_KEY || KIE_API_KEY.trim() === '') {
            console.warn("No KIE_API_KEY found (or empty). Switching to MOCK MODE.");
            const mockImages = [
                "https://placehold.co/1024x768/000000/d4af37?text=Design+Prop+1",
                "https://placehold.co/1024x768/1a1a1a/ffffff?text=Design+Prop+2",
                "https://placehold.co/1024x768/333333/d4af37?text=Design+Prop+3"
            ];
            await new Promise(resolve => setTimeout(resolve, 2000));
            return res.json({ success: true, images: mockImages });
        }

        // Upload logo if provided
        let logoUrl = null;
        if (logoFile) {
            try {
                logoUrl = await uploadLogoToKie(logoFile.buffer, logoFile.originalname, KIE_API_KEY);
                console.log(`Logo uploaded: ${logoUrl}`);
            } catch (uploadErr) {
                console.error('Logo upload failed, continuing without logo:', uploadErr.message);
            }
        }

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
                    return res.json({ success: true, images: resultUrls });
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
