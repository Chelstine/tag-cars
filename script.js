document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('designForm');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const generateBtn = document.getElementById('generateBtn');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingStep = document.getElementById('loadingStep');
    const progressBar = document.getElementById('progressBar');

    const messages = [
        { text: 'Envoi des informations...', step: 'Etape 1/3', pct: 5 },
        { text: 'Generation de votre choix en cours...', step: 'Etape 1/3', pct: 15 },
        { text: 'L\'IA dessine votre covering...', step: 'Etape 1/3', pct: 25 },
        { text: 'Votre proposition principale prend forme...', step: 'Etape 1/3', pct: 35 },
        { text: 'Generation des alternatives...', step: 'Etape 2/3', pct: 45 },
        { text: 'L\'IA compare les styles de covering...', step: 'Etape 2/3', pct: 55 },
        { text: 'Presque termine, patience...', step: 'Etape 2/3', pct: 65 },
        { text: 'Finalisation des 3 propositions...', step: 'Etape 3/3', pct: 78 },
        { text: 'Derniers ajustements...', step: 'Etape 3/3', pct: 88 },
        { text: 'Preparation de vos resultats...', step: 'Etape 3/3', pct: 95 }
    ];

    let progressInterval = null;

    function startProgress() {
        let idx = 0;
        progressBar.style.width = '5%';
        loadingMessage.textContent = messages[0].text;
        loadingStep.textContent = messages[0].step;

        progressInterval = setInterval(() => {
            idx++;
            if (idx < messages.length) {
                loadingMessage.textContent = messages[idx].text;
                loadingStep.textContent = messages[idx].step;
                progressBar.style.width = messages[idx].pct + '%';
            }
        }, 8000);
    }

    function stopProgress() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        progressBar.style.width = '100%';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        generateBtn.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');
        startProgress();

        const formData = new FormData();
        formData.append('vehicle_type', document.getElementById('vehicle_type').value);
        formData.append('vehicle_category', document.getElementById('vehicle_category').value);
        formData.append('coverage_type', document.getElementById('coverage_type').value);
        formData.append('industry', document.getElementById('industry').value);
        formData.append('brand_name', document.getElementById('brand_name').value);
        formData.append('main_text', document.getElementById('main_text').value);
        formData.append('key_info', document.getElementById('key_info').value);
        formData.append('style', document.getElementById('style').value);
        formData.append('primary_colors', document.getElementById('primary_colors').value);
        formData.append('constraints', document.getElementById('constraints').value);

        const logoInput = document.getElementById('logo_file');
        if (logoInput.files.length > 0) {
            formData.append('logo_file', logoInput.files[0]);
        }

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la génération');
            }

            if (data.images && data.images.length > 0) {
                sessionStorage.setItem('generatedImages', JSON.stringify(data.images));
                if (data.logoError) {
                    sessionStorage.setItem('logoWarning', data.logoError);
                } else {
                    sessionStorage.removeItem('logoWarning');
                }
                sessionStorage.setItem('logoUsed', data.logoUsed ? 'true' : 'false');
                sessionStorage.setItem('chosenType', data.chosenType || '');
                sessionStorage.setItem('otherTypes', JSON.stringify(data.otherTypes || []));
                window.location.href = 'results.html';
            } else {
                alert('Aucune image générée. Vérifiez la console.');
            }

        } catch (error) {
            console.error('Error:', error);
            alert(`Erreur: ${error.message}`);
        } finally {
            stopProgress();
            loadingIndicator.classList.add('hidden');
            generateBtn.classList.remove('hidden');
        }
    });
});
