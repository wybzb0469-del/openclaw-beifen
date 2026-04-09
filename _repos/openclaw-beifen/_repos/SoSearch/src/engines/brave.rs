use rquest::Client;
use scraper::{Html, Selector};
use crate::models::SearchResultItem;

pub struct Brave;

impl Brave {
    pub fn name(&self) -> &'static str {
        "Brave"
    }

    pub async fn search(&self, query: &str, client: &Client) -> Result<Vec<SearchResultItem>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("https://search.brave.com/search?q={}", urlencoding::encode(query));
        
        let response = client.get(&url).send().await?.text().await?;
        
        let document = Html::parse_document(&response);
        // Brave generally uses .snippet for main results
        let result_selector = Selector::parse(".snippet").unwrap();
        let title_selector = Selector::parse(".title").unwrap();
        let link_selector = Selector::parse("a").unwrap();
        let snippet_selector = Selector::parse(".snippet-description, .snippet-content, .description").unwrap();

        let mut results = Vec::new();

        for element in document.select(&result_selector) {
            if let Some(title_el) = element.select(&title_selector).next() {
                let title = title_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                
                let url = if let Some(link_el) = element.select(&link_selector).next() {
                    link_el.value().attr("href").unwrap_or("").to_string()
                } else {
                    String::new()
                };

                let snippet = if let Some(snip_el) = element.select(&snippet_selector).next() {
                    snip_el.text().collect::<Vec<_>>().join(" ").trim().to_string()
                } else {
                    String::new()
                };

                if !url.is_empty() && !url.starts_with('/') && !title.is_empty() {
                    results.push(SearchResultItem {
                        title,
                        url,
                        snippet,
                        engine: self.name().to_string(),
                    });
                }
            }
        }

        Ok(results)
    }
}
