use scraper::{Html, Selector};
use crate::models::SearchResultItem;
use rquest::Client;

#[derive(Clone)]
pub struct DuckDuckGo;

impl DuckDuckGo {
    pub fn name(&self) -> &'static str {
        "duckduckgo"
    }

    pub async fn search(&self, query: &str, client: &Client) -> Result<Vec<SearchResultItem>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("https://html.duckduckgo.com/html/?q={}", urlencoding::encode(query));
        
        let response = client.get(&url).send().await?.text().await?;
        
        let document = Html::parse_document(&response);
        let result_selector = Selector::parse(".result").unwrap();
        let title_selector = Selector::parse(".result__a").unwrap();
        let snippet_selector = Selector::parse(".result__snippet").unwrap();

        let mut results = Vec::new();

        for element in document.select(&result_selector) {
            if let Some(title_el) = element.select(&title_selector).next() {
                let title = title_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                let url = title_el.value().attr("href").unwrap_or("").to_string();
                
                let snippet = if let Some(snippet_el) = element.select(&snippet_selector).next() {
                    snippet_el.text().collect::<Vec<_>>().join(" ").trim().to_string()
                } else {
                    String::new()
                };

                let mut real_url = url.clone();
                if real_url.starts_with("//duckduckgo.com/l/?uddg=") {
                    if let Some(encoded_url) = real_url.split("uddg=").nth(1) {
                        if let Some(decoded) = urlencoding::decode(encoded_url.split('&').next().unwrap_or(encoded_url)).ok() {
                            real_url = decoded.into_owned();
                        }
                    }
                }

                if !title.is_empty() && !real_url.is_empty() {
                    results.push(SearchResultItem {
                        title: title.clone(),
                        url: real_url,
                        snippet: snippet.clone(),
                        engine: self.name().to_string(),
                    });
                }
            }
        }

        Ok(results)
    }
}
