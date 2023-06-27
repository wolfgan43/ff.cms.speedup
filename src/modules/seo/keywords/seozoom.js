import fetch from "node-fetch";
import fs from "fs";
import {projectPath, SEP} from "../../../constant.js";

const MAX_DEEP = 2;
const SEO_ZOOM_ENDPOINT = "https://api.seozoom.it/api/";
const SEO_ZOOM_TOKEN = "rr8hhFr3elukkww";
const SEO_ZOOM_APPID = "11";
const SEO_ZOOM_TYPE = {
    "related_intent_by_keyword": "analytics",
    "last_serp_by_keyword": "analytics",
    "keyword_of_a_url": "analytics"
};
const SEO_ZOOM_SEARCH_KEY = {
    "related_intent_by_keyword": "keyword",
    "last_serp_by_keyword": "keyword",
    "keyword_of_a_url": "url"
};
const SEO_ZOOM_QUERY_TPL = {
    "token": SEO_ZOOM_TOKEN,
    "appid": SEO_ZOOM_APPID,
    "type": null,
    "ep": null,
    "lingua": "it",
    "estensione": ".it",
    "localcode": "",
    "limit": null,
    "offset": null,
    "format": "json"
};

function showLoading() {
    let counter = 0;

    const animateLoading = () => {
        const dots = '.'.repeat(counter % 4);
        process.stdout.write(`Loading${dots}\r`);
        counter++;

        if (0/* Condizione di stop del ciclo */) {
            // Termina l'animazione
            process.stdout.write('\n'); // Vai a capo
        } else {
            // Avvia l'animazione per il prossimo ciclo
            setTimeout(animateLoading, 300);
        }
    };

    // Avvia l'animazione per il primo ciclo
    animateLoading();
}

function estimateTraffic(position, volume) {
    const ctrByPosition = {
        1: 0.32,  // CTR medio per la posizione 1
        2: 0.16,  // CTR medio per la posizione 2
        3: 0.09,  // CTR medio per la posizione 3
        4: 0.06,  // CTR medio per la posizione 4
        5: 0.05,  // CTR medio per la posizione 5
        6: 0.04,  // CTR medio per la posizione 6
        7: 0.03,  // CTR medio per la posizione 7
        8: 0.03,  // CTR medio per la posizione 8
        9: 0.02,  // CTR medio per la posizione 9
        10: 0.02  // CTR medio per la posizione 10
    };

    return volume * (ctrByPosition[position] || 0.01);
}

const estimateScore = (volume, opportunity, difficulty) => {
    return (opportunity * volume) / difficulty
}

const calculateDifficulty = (volume, opportunity, difficulty, authority, position) => {
    return volume * (1 - opportunity) * (1 - difficulty) * (1 - authority) * position;
};

let buffer      = {
    keywords    : {},
    serps       : {}
};

const seoZoomApi = async (search, strategy, limit = 10, offset = 0) => {
    const query = {
        ...SEO_ZOOM_QUERY_TPL,
        "type"                          : SEO_ZOOM_TYPE[strategy],
        "ep"                            : strategy,
        [SEO_ZOOM_SEARCH_KEY[strategy]] : search,
        "limit"                         : limit,
        "offset"                        : offset
    };

    const params = new URLSearchParams(query);
    const url = `${SEO_ZOOM_ENDPOINT}?${params}`;

    return fetch(url)
        .then(response => response ? response.json() : {})
        .catch(err => console.error(err))
};

export async function related_intent_by_keyword(search, limit = 10, offset = 0) {
    return seoZoomApi(search, "related_intent_by_keyword", limit, offset)
        .then(response => Array.isArray(response) ? response.map(item => ({
                ...item,
                score: estimateScore(item.organic_traffic, item.keyword_opportunity, item.keyword_difficulty)
            })) : []);
        //.then(response => response.sort((a, b) => b.score - a.score));
}


export async function last_serp_by_keyword(search, limit = 10, offset = 0) {
    return seoZoomApi(search, "last_serp_by_keyword", limit, offset)
        .then(response => Array.isArray(response) ? response.slice(offset, offset + limit) : []);
}

export async function keyword_of_a_url(url) {
    const response = await seoZoomApi(url, "keyword_of_a_url");
    const page = {
        url         : url,
        volume      : 0,
        score       : 0,
        average     : 0,
        authority   : response.pagezoomauthority,
        keywords    : []
    };
    delete response.pagezoomauthority;

    const keywords      = [];
    Object.keys(response).forEach((key) => {
        const item = response[key];
        const volume = estimateTraffic(item.organic_positions, item.organic_traffic);
        const score = estimateScore(volume, item.keyword_opportunity, item.keyword_difficulty);
        page.volume += volume;
        page.score += score;
        page.keywords.push(item.organic_keywords);
        keywords.push({
            ...item,
            score,
            volume
        });
    });

    page.average    = page.score / keywords.length;

    return {page, keywords};
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const keywords_research = async (keywords, deep = 0) => {
    const keywordsResearch = {};
    deep++;

    console.log("\n-------------------------------------------------------------\n");
    console.log("deep: " + deep);
    console.log(keywords.map(obj => obj.keyword).join(", "));
    console.log("start keywords: " + keywords.length);

    for (const entry of keywords) {
        const primaryKeyword = entry.keyword;
        if (buffer.keywords[primaryKeyword]) {
            console.log("<<< KEYWORD GIA FATTO: " + primaryKeyword);
            continue;
        }
        const serps = await last_serp_by_keyword(primaryKeyword);
        console.log( primaryKeyword + "  count: " + serps.length);
        for (const serp of serps) {
            if (buffer.serps[serp.url]) {
                console.log("GIA FATTO: " + serp.url);
                continue;
            }
            await sleep(2000);
            console.log( primaryKeyword + "  => " + serp.url);
            const {page, keywords} = await keyword_of_a_url(serp.url);
            console.log(" - Keywords: " + keywords.length);
            for (const stats of keywords) {
                const secondaryKeyword = stats.organic_keywords;
                const organic = {
                    url         : page.url,
                    position    : stats.organic_positions,
                    cost        : stats.organic_cost,
                    traffic     : stats.organic_traffic,
                    volume      : stats.volume,
                    score       : stats.score,
                }
                const secondaryKeywordStats = {
                    keyword             : secondaryKeyword,
                    organic_traffic     : stats.organic_traffic,
                    keyword_opportunity : stats.keyword_opportunity,
                    keyword_difficulty  : stats.keyword_difficulty,
                    score               : estimateScore(stats.organic_traffic, stats.keyword_opportunity, stats.keyword_difficulty),
                    deep                : deep,
                    pages               : 1,
                    organic             : [organic]
                };
                if (buffer.keywords[secondaryKeyword]) {
                    console.log("------------->FACCIO IL PUSH: " + secondaryKeyword + " => " + page.url);
                    buffer.keywords[secondaryKeyword].organic.push(organic);
                    buffer.keywords[secondaryKeyword].pages++;
                } else if (secondaryKeyword === primaryKeyword) {
                    console.log("AGGIUNGO KEYWORD PRIMARIA: " + primaryKeyword + " => " + page.url);
                    buffer.keywords[primaryKeyword] = {...secondaryKeywordStats, secondaryKeywords : []};
                } else if (!keywordsResearch[secondaryKeyword]) {
                    keywordsResearch[secondaryKeyword] = secondaryKeywordStats;
                } else {
                    keywordsResearch[secondaryKeyword].organic.push(organic);
                    keywordsResearch[secondaryKeyword].pages++;
                }

                if (buffer.keywords[primaryKeyword] && primaryKeyword !== secondaryKeyword) {
                    buffer.keywords[primaryKeyword].secondaryKeywords.push(stats);
                }
            }
            buffer.serps[serp.url] = page;

            //console.log(buffer.keywords);
           // console.log(buffer.serps);
        }
    }

    console.log("keywordsResearch count: " + Object.keys(keywordsResearch).length);
    console.log("$keywords count: " + Object.keys(buffer.keywords).length);

    if (deep < MAX_DEEP) {
        await keywords_research(Object.values(keywordsResearch), deep);
    }



    //console.log( buffer.serps);

};

export async function get(keyword) {
    const ksFilePath = projectPath + SEP + "ks." + keyword + ".log.json";
    if (fs.existsSync(ksFilePath)) {
        buffer    = JSON.parse(fs.readFileSync(ksFilePath));
    }
    const keywords = await related_intent_by_keyword(keyword);

    await keywords_research(keywords);


    fs.promises.writeFile(ksFilePath, JSON.stringify(buffer, null, 2));

    return buffer;
}