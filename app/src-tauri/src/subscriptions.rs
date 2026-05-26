use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchDashboardRequest {
    pub url: String,
    pub auth_cookie: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchToiotoRequest {
    pub jwt: String,
    pub timezone: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchToiotoApiRequest {
    pub jwt: String,
    pub timezone: String,
    pub path: String,
}

#[tauri::command]
pub async fn fetch_dashboard_html(request: FetchDashboardRequest) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&request.url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/148.0")
        .header("Accept", "text/html")
        .header("Cookie", format!("auth={}", request.auth_cookie))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err("Authentication failed. Check your auth cookie.".to_string());
        }
        return Err(format!("HTTP {}: Request failed", status.as_u16()));
    }

    response.text().await.map_err(|e| format!("Failed to read response: {}", e))
}

#[tauri::command]
pub async fn fetch_toioto_me(request: FetchToiotoRequest) -> Result<String, String> {
    let url = format!(
        "https://sub2api.toioto.org/api/v1/auth/me?timezone={}",
        request.timezone
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/148.0")
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {}", request.jwt))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err("Authentication failed. Check your JWT token.".to_string());
        }
        return Err(format!("HTTP {}: Request failed", status.as_u16()));
    }

    response.text().await.map_err(|e| format!("Failed to read response: {}", e))
}

#[tauri::command]
pub async fn fetch_toioto_api(request: FetchToiotoApiRequest) -> Result<String, String> {
    let url = format!(
        "https://sub2api.toioto.org/api/v1/{}?timezone={}",
        request.path, request.timezone
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/148.0")
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {}", request.jwt))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err("Authentication failed. Check your JWT token.".to_string());
        }
        return Err(format!("HTTP {}: Request failed", status.as_u16()));
    }

    response.text().await.map_err(|e| format!("Failed to read response: {}", e))
}
