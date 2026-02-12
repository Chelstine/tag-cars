const fetch = require('node-fetch');

const API_KEY = "240e212a38790ab417dcf0ccf3c16507";
const URL = "https://api.kie.ai/api/v1/gpt4o-image/generate";

async function test() {
    console.log("Testing API...");
    try {
        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                prompt: "Test car",
                size: "1:1",
                n: 1
            })
        });

        const text = await response.text();
        console.log("RAW RESPONSE:", text);

        try {
            const json = JSON.parse(text);
            console.log("PARSED JSON:", JSON.stringify(json, null, 2));
        } catch (e) {
            console.log("Could not parse JSON");
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

test();
