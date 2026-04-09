use rquest::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()?;
    
    let url = "https://search.brave.com/search?q=rust+lang";
    let res = client.get(url).send().await?.text().await?;
    std::fs::write("brave_out.html", &res)?;
    println!("Brave fetched, length: {}", res.len());

    Ok(())
}
