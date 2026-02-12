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
        const KIE_API_KEY = process.env.KIE_API_KEY; // User must set this in Railway
        const API_BASE_URL = 'https://api.kie.ai/api/v1/gpt4o-image'; // Based on research

        if (!KIE_API_KEY) {
            // Fallback to Mock if no key provided (for testing UI)
            console.warn("No KIE_API_KEY found. using Mock Data.");
            const mockImages = [
                "https://placehold.co/1024x768/000000/d4af37?text=Design+Prop+1",
                "https://placehold.co/1024x768/1a1a1a/ffffff?text=Design+Prop+2",
                "https://placehold.co/1024x768/333333/d4af37?text=Design+Prop+3"
            ];
            return setTimeout(() => res.json({ success: true, images: mockImages }), 2000);
        }

        // 1. Initiate Generation Task
        console.log("Sending request to Kie.ai...");
        const generateResponse = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIE_API_KEY}`
            },
            body: JSON.stringify({
                prompt: prompt,
                size: "1024x1024", // Assuming standard format, or "3:2" based on docs
                n: 3 // Requesting 3 variants
            })
        });

        const genData = await generateResponse.json();
        console.log("Generation Start Response:", genData);

        if (!generateResponse.ok) {
            throw new Error(`Kie.ai Error: ${JSON.stringify(genData)}`);
        }

        // Kie.ai likely returns a task_id or similar. 
        // Adapting based on common async patterns: { code: 200, data: { task_id: "..." } }
        const taskId = genData.data?.task_id || genData.task_id;

        if (!taskId) {
            // Check if it returned images directly (Sync mode)
            if (genData.data && Array.isArray(genData.data) && genData.data[0].url) {
                return res.json({ success: true, images: genData.data.map(img => img.url) });
            }
            throw new Error("No Task ID or Images received from Kie.ai");
        }

        // 2. Poll for Results
        let attempts = 0;
        const maxAttempts = 30; // 30 * 2s = 60s timeout

        const checkStatus = async () => {
            const statusResponse = await fetch(`${API_BASE_URL}/record-info?task_id=${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
            });
            const statusData = await statusResponse.json();
            console.log("Polling Status:", statusData);

            // Check for completion (Adapt based on actual API response structure)
            // effective response often has status: "success" or "completed" and data: { images: [...] }
            if (statusData.code === 200 && statusData.data && statusData.data.status === 'SUCCESS') {
                return statusData.data.result; // Expecting { url: "..." } array
            }

            if (statusData.data && statusData.data.status === 'FAILED') {
                throw new Error("Image Generation Failed");
            }

            return null; // Still processing
        };

        let resultImages = null;
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
            const result = await checkStatus();
            if (result) {
                // Formatting result to array of URLs
                // Adjust per actual response: result might be [{url: '...'}, ...]
                resultImages = Array.isArray(result) ? result.map(img => img.url) : [result.url];
                break;
            }
            attempts++;
        }

        if (resultImages) {
            res.json({ success: true, images: resultImages });
        } else {
            throw new Error("Timeout waiting for Kie.ai generation");
        }

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
