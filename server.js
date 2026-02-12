const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Ensure node-fetch is installed if using Node < 18, or use built-in fetch in Node 18+
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.'))); // Serve static files from current dir

// Placeholder for the external AI API endpoint
// You would replace this with the actual URL provided by 'Akei AI' or OpenAI
const AI_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1/images/generations';

app.post('/api/generate', async (req, res) => {
    try {
        const {
            vehicle_type, vehicle_view, coverage_zones, vehicle_category, coverage_type,
            industry, brand_name, main_text, key_info, style, primary_colors, constraints, logo_instruction
        } = req.body;

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
Instruction logo : ${logo_instruction}
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

        // 1. Initiate Generation Task
        console.log(`🚀 Sending request to Kie.ai (${API_BASE_URL})...`);

        // standard node-fetch v2 usage
        const generateResponse = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIE_API_KEY}`
            },
            body: JSON.stringify({
                prompt: prompt,
                size: "1:1",
                n: 3
            })
        });

        const genData = await generateResponse.json();
        console.log("Generation Response:", JSON.stringify(genData, null, 2));

        if (!generateResponse.ok) {
            console.error("Kie.ai API Error:", genData);
            return res.status(500).json({ success: false, error: genData.message || "Failing contacting Kie.ai" });
        }

        // Handle Sync vs Async responses
        const taskId = genData.data?.task_id || genData.task_id;

        if (!taskId) {
            // Check for direct images (Sync mode)
            if (genData.data && Array.isArray(genData.data) && genData.data[0].url) {
                return res.json({ success: true, images: genData.data.map(img => img.url) });
            }
            // Check for single image in data
            if (genData.data && genData.data.url) {
                return res.json({ success: true, images: [genData.data.url] });
            }
            console.error("Unknown API Response Structure:", genData);
            return res.status(500).json({ success: false, error: "Invalid response from AI provider" });
        }

        // 2. Poll for Results
        console.log(`⏳ Task ID received: ${taskId}. Polling for results...`);
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s

            const statusResponse = await fetch(`${API_BASE_URL}/record-info?task_id=${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
            });

            if (!statusResponse.ok) {
                console.warn(`Polling request failed: ${statusResponse.status}`);
                attempts++;
                continue;
            }

            const statusData = await statusResponse.json();
            console.log(`Polling attempt ${attempts + 1}/${maxAttempts}:`, statusData?.data?.status || "Unknown");

            if (statusData.code === 200 && statusData.data && statusData.data.status === 'SUCCESS') {
                const result = statusData.data.result;
                const resultImages = Array.isArray(result) ? result.map(img => img.url) : [result.url];
                return res.json({ success: true, images: resultImages });
            }

            if (statusData.data && statusData.data.status === 'FAILED') {
                console.error("❌ Task Failed Details:", JSON.stringify(statusData, null, 2));
                const failureReason = statusData.data.failure_reason || statusData.data.error || "Unknown error from AI provider";
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
