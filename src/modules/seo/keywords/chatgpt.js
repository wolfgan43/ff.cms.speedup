import fetch from "node-fetch";

const LANGUAGE = "italian";
const OUTPUT = "json";

const CHATGPT_URL = 'https://api.openai.com/v1/chat/completions';
const CHATGPT_APYKEY = '';

const CHATGPT_PROMPTS = {
    SEARCH_INTENT_FROM_KEYWORDS: `
        Please ignore all previous instructions.
        Please respond only in the {language} language.
        You are a keyword research expert that speaks and writes fluent {language}.
        I will give you a long list of keywords, and I want you to classify them by the search intent, whether commercial, transactional, navigational, informational, local or investigational. 
        Once done, please print them out in a {output} with "Keyword" as the first column, and "Search Intent" as the second. 
        Here are the keywords - {search}
    `,
    RELATED_KEYWORD_GENERATOR: `
        Please ignore all previous instructions. 
        Please respond only in the {language} language. 
        You are a keyword research expert that speaks and writes fluent {language}. 
        I want you to generate a list of {limit} keywords closely related to "{search}" without duplicating any words. 
        Please create a {output} with two columns "Keyword" and "Search Intent". 
        The first column should be the keyword you generated, and the second column should be the search intent of the keyword (commercial, transactional, navigational, informational, local or investigational). 
        Do not repeat yourself. Do not self reference. Do not explain what you are doing.
    `,
    LONG_TAIL_KEYWORD_GENERATOR: `
        Please ignore all previous instructions. 
        Please respond only in the {language} language. 
        You are a keyword research expert that speaks and writes fluent {language}. 
        I want you to generate a list of {limit} long-tail keywords for "{search}". 
        Please create a {output} with two columns "Keyword" and "Search Intent". 
        The first column should be the keyword you generated, and the second column should be the search intent of the keyword (commercial, transactional, navigational, informational, local or investigational). 
        Do not repeat yourself. Do not self reference. Do not explain what you are doing.
    `,
    KEYWORD_STRATEGY: `
        Please ignore all previous instructions. 
        Please respond only in the {language} language. 
        You are a market research expert that speaks and writes fluent {language}. 
        You are an expert in keyword research and can develop a full SEO content plan in fluent {language}. 
        "{search}" is the target keyword for which you need to create a Keyword Strategy & Content Plan. 
        Create a {output} with a list of {limit} closely related keywords for an SEO strategy plan for the main keyword "{search}". 
        Cluster the keywords according to the top 10 super categories and name the super category in the first column as "Category". 
        There should be a maximum of 6 keywords in a super category. 
        The second column should be called "Keyword" and contain the suggested keyword. 
        The third column will be called "Search Intent" and will show the search intent of the suggested keyword from the following list of intents (commercial, transactional, navigational, informational, local or investigational). 
        The fourth column will be called "Title" and will be catchy and click-bait title to use for an article or blog post about that keyword. 
        The fifth column will be called "Description: and will be a catchy meta description with a maximum length of 160 words. 
        The meta description should ideally have a call to action. 
        Do not use single quotes, double quotes or any other enclosing characters in any of the columns you fill in. 
        Do not self reference. Do not explain what you are doing. Just return your suggestions in the {output}.
    `,
    GENERATE_BLOG_POST_TITLES: `
        Please ignore all previous instructions. 
        You are an expert copywriter who writes catchy titles for blog posts. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        Write {limit} catchy blog post titles with a hook for the topic "{search}". 
        The titles should be written in the {language} language. 
        The titles should be less than 60 characters. 
        The titles should include the words from the topic "{search}". 
        Do not use single quotes, double quotes or any other enclosing characters. 
        Do not self reference. Do not explain what you are doing.
    `,
    GENERATE_BLOG_POST_DESCRIPTIONS: `
        Please ignore all previous instructions. 
        You are an expert copywriter who writes catchy descriptions for blog posts. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        Write {limit} catchy blog post descriptions with a hook for the blog post titled "{search}". 
        The descriptions should be written in the {language} language. 
        The descriptions should be less than 160 characters. 
        The descriptions should include the words from the title "{search}". 
        Do not use single quotes, double quotes or any other enclosing characters. Do not self reference. 
        Do not explain what you are doing.
    `,
    GENERATE_BLOG_POST_OUTLINE: `
        Please ignore all previous instructions. 
        You are an expert copywriter who creates content outlines. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        Create a long form content outline in the {language} language for the blog post titled "{search}".  
        The content outline should include a minimum of 20 headings and subheadings. 
        The outline should be extensive and it should cover the entire topic. 
        Create detailed subheadings that are engaging and catchy. 
        Do not write the blog post, please only write the outline of the blog post. 
        Please do not number the headings. 
        Please add a newline space between headings and subheadings. 
        Do not self reference. Do not explain what you are doing.
    `,
    GENERATE_COMPLETE_BLOG_POST_FROM_OUTLINE: `
        Please ignore all previous instructions. 
        You are an expert copywriter who writes detailed and thoughtful blog articles. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        I will give you an outline for an article and I want you to expand in the {language} language on each of the subheadings to create a complete article from it. 
        Please intersperse short and long sentences. 
        Utilize uncommon terminology to enhance the originality of the content. 
        Please format the content in a professional format. 
        Do not self reference. Do not explain what you are doing. 
        The blog article outline is - "{search}"
    `,
    GENERATE_COMPLETE_BLOG_POST_FROM_TOPIC: `
        Please ignore all previous instructions. 
        You are an expert copywriter who writes detailed and thoughtful blog articles. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        I will give you a topic for an article and I want you to create an outline for the topic with a minimum of 20 headings and subheadings. 
        I then want you to expand in the {language} language on each of the individual subheadings in the outline to create a complete article from it. 
        Please intersperse short and long sentences. 
        Utilize uncommon terminology to enhance the originality of the content. 
        Please format the content in a professional format. 
        Do not self reference. Do not explain what you are doing. 
        Send me the outline and then immediately start writing the complete article. 
        The blog article topic is - "{search}". 
    `,
    GENERATE_INTRODUCTION_USING_FRAMEWORK: `
        Please ignore all previous instructions. 
        You are an expert copywriter who writes detailed and compelling blog articles. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        I want you to write a compelling blog introduction paragraph of around {limit} words on "{search}" in the {language} language. 
        Please use the {framework} copywriting framework to hook and grab the attention of the blog readers. 
        Please intersperse short and long sentences. 
        Utilize uncommon terminology to enhance the originality of the content. 
        Please format the content in a professional format. 
        Do not self reference. Do not explain what you are doing. 
        I will give you a list of keywords below and it would be great if you can add them into the text wherever appropriate. 
        Please do highlight these keywords in bold in the text using markdown if you have them in the text. 
        Here are the keywords - "{keywords}". Remember that the topic is "{search}"
    `,
    GENERATE_PARAGRAPH_OF_TEXT: `
        Please ignore all previous instructions. 
        You are an expert copywriter who writes detailed and thoughtful blog articles. 
        You have a {voice} tone of voice. 
        You have a {style} writing style. 
        I want you to write around {limit} words on "{search}" in the {language} language. 
        I will give you a list of keywords that need to be in the text that you create. 
        Please intersperse short and long sentences. 
        Utilize uncommon terminology to enhance the originality of the content. 
        Please format the content in a professional format. 
        Do not self reference. Do not explain what you are doing. 
        Here are the keywords - "{keywords}". 
        Please highlight these keywords in bold in the text using markdown.
    `,
};


const chatGPTApi = async (search, strategy, limit = 10) => {
    const chatGPTPrompt = (strategy, search, limit) => {
        return (CHATGPT_PROMPTS[strategy] || "")
            .replaceAll('{output}', OUTPUT)
            .replaceAll('{language}', LANGUAGE)
            .replaceAll('{voice}', null)
            .replaceAll('{style}', null)
            .replaceAll('{framework}', null)
            .replaceAll('{keywords}', null)
            .replaceAll('{search}', search)
            .replaceAll('{limit}', limit);
    };

    return fetch(CHATGPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + CHATGPT_APYKEY
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: chatGPTPrompt(strategy, search, limit) }
            ]
        })
    })
    .then(response => response.json())
    .then(response => data.choices[0].message.content)
}

export async function search_intent_by_keywords(search, limit = 10) {
    return chatGPTApi(search, "SEARCH_INTENT_FROM_KEYWORDS", limit)
        .then(response => Array.isArray(response) ? response.map(item => ({
            ...item,
            score: estimateScore(item.organic_traffic, item.keyword_opportunity, item.keyword_difficulty)
        })) : []);
    //.then(response => response.sort((a, b) => b.score - a.score));
}
