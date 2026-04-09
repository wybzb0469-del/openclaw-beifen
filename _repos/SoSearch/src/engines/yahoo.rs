use rquest::Client;
use scraper::{Html, Selector};
use crate::models::SearchResultItem;

pub struct Yahoo;

impl Yahoo {
    pub fn name(&self) -> &'static str {
        "Yahoo"
    }

    pub async fn search(&self, query: &str, client: &Client) -> Result<Vec<SearchResultItem>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("https://search.yahoo.com/search?p={}", urlencoding::encode(query));
        
        // Yahoo tends to be lenient with datacenter IPs compared to others, but we still use the impersonated client
        let response = client.get(&url).send().await?.text().await?;
        
        let document = Html::parse_document(&response);
        let result_selector = Selector::parse(".algo").unwrap();
        let title_selector = Selector::parse("h3").unwrap();
        let link_selector = Selector::parse(".compTitle a").unwrap();
        let snippet_selector = Selector::parse(".compText").unwrap();

        let mut results = Vec::new();

        for element in document.select(&result_selector) {
            if let Some(title_el) = element.select(&title_selector).next() {
                let title = title_el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                
                let mut url = if let Some(link_el) = element.select(&link_selector).next() {
                    link_el.value().attr("href").unwrap_or("").to_string()
                } else {
                    String::new()
                };

                // Extract real URL from Yahoo redirect structure (RU=.../RK=...)
                if url.contains("RU=") && url.contains("/RK=") {
                    if let Some(start) = url.find("RU=") {
                        let sub = &url[start + 3..];
                        if let Some(end) = sub.find("/RK=") {
                            if let Ok(decoded) = urlencoding::decode(&sub[..end]) {
                                url = decoded.into_owned();
                            }
                        }
                    }
                }

                let snippet = if let Some(snip_el) = element.select(&snippet_selector).next() {
                    snip_el.text().collect::<Vec<_>>().join(" ").trim().to_string()
                } else {
                    String::new()
                };

                if !url.is_empty() && !title.is_empty() {
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
