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

// Increase server timeout to 10 minutes for long generation requests
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
server.timeout = 600000;
server.keepAliveTimeout = 600000;
server.headersTimeout = 610000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadLogoToKie(fileBuffer, fileName, apiKey) {
    const base64Raw = fileBuffer.toString('base64');
    const ext = path.extname(fileName).slice(1).toLowerCase() || 'png';
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const dataUrl = `data:${mimeType};base64,${base64Raw}`;

    console.log(`[LOGO] Uploading to Kie.ai (${fileName}, ${(fileBuffer.length / 1024).toFixed(1)} KB, ext=${ext})...`);

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

function buildSinglePrompt(coveringType, vehicle_type, vehicle_category, brand_name, main_text, key_info, industry, style, primary_colors, constraints, logoFile, logoUrl) {
    const coveringDesc = {
        'Standard': `STANDARD (Lettrage / Marquage simple) : Le vehicule GARDE sa couleur d'origine intacte. Seuls le nom de marque, le slogan, les coordonnees et le logo sont appliques en lettrage vinyle decoupe sur le flanc lateral (PAS sur les vitres). Aucun fond colore, aucun covering de surface. Le lettrage utilise les couleurs ${primary_colors}. La peinture d'origine du vehicule reste 100% visible.`,
        'Semi-cover': `SEMI-COVER (Covering partiel - EXACTEMENT 40 a 60% de la surface) : Les couleurs ${primary_colors} recouvrent OBLIGATOIREMENT entre 40% et 60% de la surface laterale du vehicule. Par exemple : toute la moitie basse du vehicule est recouverte OU toute la partie arriere depuis les portes. La zone couverte forme un bloc VISIBLE et CLAIR aux couleurs ${primary_colors}. Le reste de la carrosserie (40 a 60% restant) DOIT rester dans la couleur d'origine du vehicule, SANS aucun covering. Le nom de marque, slogan et coordonnees sont integres dans la zone couverte.`,
        'Full cover': `FULL COVER (Total covering) : Les couleurs ${primary_colors} recouvrent la TOTALITE de la carrosserie visible (capot, flancs, portes, hayon) SAUF les vitres et les pare-chocs. Le vehicule entier est transforme aux couleurs ${primary_colors}. Le nom, slogan et coordonnees sont integres dans le design global.`
    };

    let logoInstruction = 'Pas de logo fourni. Utilise une typographie soignee et elegante pour afficher le nom de marque sur le vehicule.';
    if (logoFile) {
        if (logoUrl) {
            logoInstruction = 'Logo fourni : OUI. Le logo DOIT OBLIGATOIREMENT apparaitre sur l\'image, c\'est une EXIGENCE ABSOLUE du client. Place le logo bien visible et en GRANDE TAILLE sur le flanc lateral du vehicule (portiere ou panneau lateral). Le logo doit etre reproduit A L\'IDENTIQUE : memes couleurs, memes formes, memes proportions, sans AUCUNE modification ni deformation. Le logo est aussi IMPORTANT que les textes. Si le logo n\'est pas visible et identifiable sur l\'image finale, le resultat sera REFUSE et REJETE. Integre le logo comme element central du design du covering.';
        } else {
            logoInstruction = 'Logo fourni mais echec upload. Utilise une typographie soignee pour le nom de marque a la place du logo.';
        }
    }

    return `Tu es un designer expert en covering vehicule commercial. Genere UNE SEULE IMAGE avec UN SEUL vehicule.

VEHICULE : ${vehicle_type} (${vehicle_category})
VUE : Profil lateral pur (perpendiculaire au flanc). Vehicule complet dans le cadre. Fond neutre.

COVERING A APPLIQUER : ${coveringType}
${coveringDesc[coveringType] || coveringDesc['Standard']}

COULEURS OBLIGATOIRES DU DESIGN : ${primary_colors}
Ces couleurs doivent etre utilisees pour tout le covering/lettrage. C'est le choix du client.

TEXTES A AFFICHER (STRICTEMENT - NE RIEN INVENTER, NE RIEN OUBLIER) :
- Marque : "${brand_name}" ${brand_name ? '-> DOIT apparaitre sur le vehicule' : '-> non fourni, ne pas afficher'}
- Slogan : "${main_text}" ${main_text ? '-> DOIT apparaitre sur le vehicule' : '-> non fourni, ne pas afficher'}
- Infos : "${key_info}" ${key_info ? '-> DOIT apparaitre sur le vehicule' : '-> non fourni, ne pas afficher'}
- Secteur : ${industry}
REGLES TEXTE : Affiche TOUS les textes fournis ci-dessus, AUCUNE exception. N'invente AUCUN texte, AUCUN numero de telephone, AUCUNE adresse, AUCUN slogan qui ne figure pas ci-dessus. Si un champ est vide, ne l'affiche pas. Chaque texte fourni DOIT etre LISIBLE et CORRECT sur l'image finale.

Style : ${style}

LOGO : ${logoInstruction}

${constraints ? 'CONTRAINTES : ' + constraints : ''}

REGLES STRICTES :
1. UNE SEULE IMAGE, UN SEUL vehicule "${vehicle_type}"
2. Profil lateral uniquement, pas de 3/4, pas de face
3. Pas de collage, pas de mosaique
4. Le vehicule doit etre ENTIER et COMPLET dans l'image. RIEN ne doit etre coupe : on doit voir le pare-chocs avant, le pare-chocs arriere, le toit et les roues en entier. NE COUPE JAMAIS une partie du vehicule. Laisse des MARGES genereuses autour du vehicule.
5. Rendu photorealiste, ratio 1:1
6. TOUS les textes fournis (marque, slogan, infos) doivent etre presents et lisibles sur le vehicule. N'en oublie AUCUN.
7. N'ajoute AUCUN texte, AUCUN mot, AUCUN numero qui n'a pas ete fourni par le client. ZERO invention.
8. Si un logo a ete fourni, il DOIT apparaitre sur le vehicule, bien visible, en taille suffisante, reproduit A L'IDENTIQUE. Le logo est OBLIGATOIRE et NON NEGOCIABLE. Ne le remplace PAS par du texte, ne l'omets PAS, ne le deforme PAS.
`;
}

// Submit a generation request to KIE API and get taskId
async function submitGeneration(prompt, logoUrl, apiKey, apiBaseUrl, label) {
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
        if (genData.data && Array.isArray(genData.data) && genData.data[0]?.url) {
            return { directUrl: genData.data[0].url };
        }
        if (genData.data?.url) {
            return { directUrl: genData.data.url };
        }
        throw new Error(`No taskId for ${label}: ${JSON.stringify(genData)}`);
    }

    return { taskId };
}

// Poll a taskId until result, with stuck detection
async function pollForResult(taskId, apiKey, apiBaseUrl, label, maxAttempts) {
    console.log(`[${label}] Task ID: ${taskId}. Polling (max ${maxAttempts})...`);
    let attempts = 0;
    let zeroProgressCount = 0;
    const STUCK_THRESHOLD = 15; // 15 polls at 0% = ~75s stuck

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
        const progress = parseFloat(statusData?.data?.progress || "0");
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

        // Stuck detection: if progress stays at 0 for too long, abort to retry
        if (progress === 0) {
            zeroProgressCount++;
            if (zeroProgressCount >= STUCK_THRESHOLD) {
                console.warn(`[${label}] STUCK at 0% for ${zeroProgressCount} polls (~${zeroProgressCount * 5}s). Aborting to retry.`);
                throw new Error('STUCK');
            }
        } else {
            zeroProgressCount = 0;
        }

        attempts++;
    }

    throw new Error(`${label} timed out after polling`);
}

// Full generation with automatic retry if task gets stuck at 0%
async function generateSingleImage(prompt, logoUrl, apiKey, apiBaseUrl, label) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const result = await submitGeneration(prompt, logoUrl, apiKey, apiBaseUrl, label);
            if (result.directUrl) return result.directUrl;

            const imageUrl = await pollForResult(result.taskId, apiKey, apiBaseUrl, label, 40);
            return imageUrl;
        } catch (err) {
            if (err.message === 'STUCK' && attempt === 1) {
                console.warn(`[${label}] Task stuck at 0%. RETRYING with new request (attempt 2/2)...`);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`${label} failed after 2 attempts`);
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

        console.log(`=== Starting 3 generations in parallel ===`);
        console.log(`1. ${chosenType} (chosen)`);
        console.log(`2. ${otherTypes[0]} (alternative)`);
        console.log(`3. ${otherTypes[1]} (alternative)`);

        // Keep connection alive during long generation
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=600');

        // Launch ALL 3 generations in parallel - use allSettled so partial results still work
        const results = await Promise.allSettled([
            generateSingleImage(prompt1, logoUrl, KIE_API_KEY, API_BASE_URL, chosenType),
            generateSingleImage(prompt2, logoUrl, KIE_API_KEY, API_BASE_URL, otherTypes[0]),
            generateSingleImage(prompt3, logoUrl, KIE_API_KEY, API_BASE_URL, otherTypes[1])
        ]);

        const images = results.map(r => r.status === 'fulfilled' ? r.value : null);
        const errors = results.map(r => r.status === 'rejected' ? r.reason.message : null);
        const successCount = images.filter(Boolean).length;

        console.log(`=== Generations done: ${successCount}/3 succeeded ===`);
        results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[FAIL] ${[chosenType, ...otherTypes][i]}: ${r.reason.message}`);
        });

        if (successCount === 0) {
            throw new Error('Les 3 generations ont echoue. Veuillez reessayer.');
        }

        return res.json({
            success: true,
            images: images,
            errors: errors,
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
