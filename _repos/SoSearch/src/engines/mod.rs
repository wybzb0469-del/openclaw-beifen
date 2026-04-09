pub mod duckduckgo;
pub mod brave;
pub mod yahoo;

use duckduckgo::DuckDuckGo;
use brave::Brave;
use yahoo::Yahoo;
use crate::models::SearchResultItem;
use rquest::Client;

pub enum SearchEngine {
    DuckDuckGo(DuckDuckGo),
    Brave(Brave),
    Yahoo(Yahoo),
}

impl SearchEngine {
    pub fn name(&self) -> &'static str {
        match self {
            Self::DuckDuckGo(e) => e.name(),
            Self::Brave(e) => e.name(),
            Self::Yahoo(e) => e.name(),
        }
    }

    pub async fn search(&self, query: &str, client: &Client) -> Result<Vec<SearchResultItem>, Box<dyn std::error::Error + Send + Sync>> {
        match self {
            Self::DuckDuckGo(e) => e.search(query, client).await,
            Self::Brave(e) => e.search(query, client).await,
            Self::Yahoo(e) => e.search(query, client).await,
        }
    }
}
