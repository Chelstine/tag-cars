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

    console.log(`📤 Uploading logo to Kie.ai (${fileName}, ${(fileBuffer.length / 1024).toFixed(1)} KB)...`);
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
    console.log('📤 Upload response:', JSON.stringify(uploadData, null, 2));
    if (!uploadResponse.ok || uploadData.code !== 200) {
        throw new Error(`Logo upload failed: ${uploadData.msg || 'Unknown error'}`);
    }
    return uploadData.data.fileUrl;
}

app.post('/api/generate', upload.single('logo_file'), async (req, res) => {
    try {
        const {
            vehicle_type, vehicle_view, coverage_zones, vehicle_category, coverage_type,
            industry, brand_name, main_text, key_info, style, primary_colors, constraints
        } = req.body;
        const logoFile = req.file; // multer puts the uploaded file here

        // Construct the Prompt exactly as requested
        const prompt = `
Tu es un designer expert en lettrage/covering de véhicules. Génère une proposition de design cohérente, professionnelle et imprimable, adaptée au support demandé.
1) Contexte du projet
Type de véhicule : ${vehicle_type}
Vue à représenter : ${vehicle_view}
Couverture / zones à couvrir : ${coverage_zones}
Type de véhicule (catalogue PrintMyCar) : ${vehicle_category}
Type de recouvrement : ${coverage_type}
Vue : ${vehicle_view}

Objectif : créer un design de lettrage/covering adapté à cette vue, avec une composition réaliste et crédible sur un véhicule (proportions, placement, lisibilité).

2) Marque & message
Secteur d’activité : ${industry}
Nom de marque (texte exact) : "${brand_name}"
Texte principal (texte exact) : "${main_text}"
Infos clés à afficher (texte exact) : "${key_info}"
Règle : n’invente aucun contenu. N’ajoute pas d’adresse, de slogan, de numéro ou de texte qui n’est pas fourni.

3) Style & couleurs
Style demandé : ${style}
Couleurs principales : ${primary_colors}
Consignes de style : Respecter le style demandé et les codes visuels du secteur d’activité. Créer une hiérarchie claire. Lisibilité à distance.

4) Contraintes
Contraintes utilisateur : ${constraints}
Règles : Respecter strictement les éléments à inclure. Éviter les détails trop fins.

5) Logo & assets
Logo fourni : ${logoFile ? 'Oui (image jointe en référence)' : 'Non'}
Règles logo : Si un logo est fourni : l’intégrer proprement. Si non : typographie simple.

6) Sortie attendue
Générer 3 variante(s) distincte(s). Rendu attendu : maquette réaliste sur la vue demandée.
`;

        console.log("Generated Prompt:", prompt);

        // --- KIE.AI INTEGRATION ---
        const KIE_API_KEY = process.env.KIE_API_KEY;
        const API_BASE_URL = 'https://api.kie.ai/api/v1/gpt4o-image';

        // 0. CHECK IF KEY IS PRESENT
        if (!KIE_API_KEY || KIE_API_KEY.trim() === '') {
            console.warn("⚠️ No KIE_API_KEY found (or empty). Switching to MOCK MODE.");
            const mockImages = [
                "https://placehold.co/1024x768/000000/d4af37?text=Design+Prop+1",
                "https://placehold.co/1024x768/1a1a1a/ffffff?text=Design+Prop+2",
                "https://placehold.co/1024x768/333333/d4af37?text=Design+Prop+3"
            ];
            // Using a Promise-based delay instead of returning setTimeout to avoid ambiguity
            await new Promise(resolve => setTimeout(resolve, 2000));
            return res.json({ success: true, images: mockImages });
        }

        // 1. Upload logo if provided
        let logoUrl = null;
        if (logoFile) {
            try {
                logoUrl = await uploadLogoToKie(logoFile.buffer, logoFile.originalname, KIE_API_KEY);
                console.log(`✅ Logo uploaded: ${logoUrl}`);
            } catch (uploadErr) {
                console.error('⚠️ Logo upload failed, continuing without logo:', uploadErr.message);
            }
        }

        // 2. Initiate Generation Task
        console.log(`🚀 Sending request to Kie.ai (${API_BASE_URL})...`);

        const requestBody = {
            prompt: prompt,
            size: "1:1",
            nVariants: 2
        };
        // If logo was uploaded, pass it as reference image
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
        console.log("🚀 Kie.ai RAW Response:", JSON.stringify(genData, null, 2));

        if (!generateResponse.ok || (genData.code && genData.code !== 200)) {
            console.error("❌ Kie.ai API Error:", genData);
            const errorMsg = genData.msg || genData.message || "Unknown error from AI provider";
            return res.status(500).json({ success: false, error: `AI Provider Error: ${errorMsg} (Code: ${genData.code})` });
        }

        // Handle Async response
        // API returns: { code: 200, msg: "success", data: { taskId: "..." } }
        const taskId = genData.data?.taskId || genData.taskId;

        if (!taskId) {
            // Check for direct images (Sync mode)
            if (genData.data && Array.isArray(genData.data) && genData.data[0].url) {
                return res.json({ success: true, images: genData.data.map(img => img.url) });
            }
            // Check for single image in data
            if (genData.data && genData.data.url) {
                return res.json({ success: true, images: [genData.data.url] });
            }
            console.error("Unknown API Response Structure:", JSON.stringify(genData, null, 2));
            return res.status(500).json({ success: false, error: "Invalid response from AI provider (No task_id found)" });
        }

        // 3. Poll for Results (60 attempts × 5s = up to 5 minutes)
        console.log(`⏳ Task ID received: ${taskId}. Polling for results...`);
        let attempts = 0;
        const maxAttempts = 60;

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 5000)); // Wait 5s

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
                // Success: extract image URLs from response.result_urls
                const response = statusData.data.response;
                const resultUrls = response?.result_urls || [];
                if (resultUrls.length > 0) {
                    return res.json({ success: true, images: resultUrls });
                }
                // Fallback: check other possible structures
                console.warn("Success but no result_urls found:", JSON.stringify(statusData.data, null, 2));
                return res.status(500).json({ success: false, error: "Generation succeeded but no images returned" });
            }

            if (successFlag === 2) {
                console.error("❌ Task Failed Details:", JSON.stringify(statusData, null, 2));
                const failureReason = statusData.data.errorMessage || statusData.data.failMsg || "Unknown error from AI provider";
                return res.status(500).json({ success: false, error: `AI Failed: ${failureReason}` });
            }

            attempts++;
        }

        return res.status(504).json({ success: false, error: "Timeout waiting for generations" });

    } catch (error) {
        console.error("🔥 Server Exception:", error);
        // Ensure headers aren't already sent
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
