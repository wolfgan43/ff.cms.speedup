const fetch = require('node-fetch');
const { parse } = require('node-html-parser');
const { TfIdf } = require('natural');

/**
 * Calcola i termini TF-IDF per un array di URL e restituisce i risultati.
 *
 * @param {string[]} urls Array di URL da analizzare.
 * @param {string} language Lingua del testo da analizzare (es: 'it', 'en').
 * @param {string[]} stopwords Array di parole da escludere dall'analisi (stopwords).
 * @returns {Promise<{ url: string; tfidf: { term: string; tfidf: number }[] }[]>}
 *     Un array di oggetti contenenti l'URL e i termini TF-IDF per ogni pagina web.
 */
export async function calculateTfIdf(urls, language, stopwords) {
    const tfidf = new TfIdf(language);
    const results = [];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            const html = await response.text();
            const root = parse(html);

            // Estrai il testo dal contenuto HTML
            const text = root.textContent.toLowerCase();

            // Tokenize the text
            const tokens = text.split(/\s+/);

            // Rimuovi le stopwords
            const filteredTokens = tokens.filter((token) => !stopwords.includes(token));

            // Aggiungi il documento al TF-IDF
            tfidf.addDocument(url, filteredTokens);

            // Recupera i termini TF-IDF per la pagina web
            const pageTfIdf = tfidf.getTfIdf(url);

            // Converti i termini TF-IDF in un array di oggetti
            const tfidfData = Object.entries(pageTfIdf).map(([term, tfidfValue]) => {
                return { term, tfidf: tfidfValue };
            });

            // Aggiungi i risultati all'array
            results.push({ url, tfidf: tfidfData });
        } catch (error) {
            console.error(`Errore durante l'analisi di ${url}: ${error.message}`);
        }
    }

    return results;
}

// Esempio di utilizzo
const urls = [
    'https://www.example1.com',
    'https://www.example2.com',
    'https://www.example3.com',
];
const language = 'it'; // Specifica la lingua (es: 'it', 'en')
const stopwords = ['il', 'la', 'degli', 'dei', 'di', 'a', 'da', 'in', 'con', 'e']; // Lista di stopwords

calculateTfIdf(urls, language, stopwords)
    .then((results) => {
        console.log(results);
    })
    .catch((error) => {
        console.error('Errore durante il calcolo dei termini TF-IDF:', error);
    });
