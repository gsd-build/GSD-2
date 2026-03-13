use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// OAuth provider configuration
// ---------------------------------------------------------------------------

const ANTHROPIC_AUTH_URL: &str = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL: &str = "https://claude.ai/oauth/token";
const ANTHROPIC_CLIENT_ID: &str = "gsd-mission-control";

const GITHUB_AUTH_URL: &str = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_COPILOT_CLIENT_ID: &str = "gsd-mission-control";

const REDIRECT_URI: &str = "gsd://oauth/callback";

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

pub struct PkceChallenge {
    pub code_verifier: String,
    pub code_challenge: String,
}

/// Generate a PKCE S256 code_verifier / code_challenge pair.
pub fn generate_pkce() -> PkceChallenge {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let code_verifier = URL_SAFE_NO_PAD.encode(bytes);

    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let digest = hasher.finalize();
    let code_challenge = URL_SAFE_NO_PAD.encode(digest);

    PkceChallenge {
        code_verifier,
        code_challenge,
    }
}

// ---------------------------------------------------------------------------
// OAuth URL builders
// ---------------------------------------------------------------------------

pub fn anthropic_auth_url(pkce: &PkceChallenge, state: &str) -> String {
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}",
        ANTHROPIC_AUTH_URL,
        ANTHROPIC_CLIENT_ID,
        urlencoding(REDIRECT_URI),
        pkce.code_challenge,
        state,
    )
}

pub fn github_copilot_auth_url(pkce: &PkceChallenge, state: &str) -> String {
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}&scope=copilot",
        GITHUB_AUTH_URL,
        GITHUB_COPILOT_CLIENT_ID,
        urlencoding(REDIRECT_URI),
        pkce.code_challenge,
        state,
    )
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Token response
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/// Exchange an authorization code for tokens via provider token endpoint.
pub async fn exchange_code(
    provider: &str,
    code: &str,
    code_verifier: &str,
) -> Result<TokenResponse, String> {
    let token_url = match provider {
        "anthropic" => ANTHROPIC_TOKEN_URL,
        "github-copilot" => GITHUB_TOKEN_URL,
        other => {
            return Err(format!("[oauth] unknown provider for token exchange: {other}"));
        }
    };

    let client = reqwest::Client::new();
    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code");
    params.insert("code", code);
    params.insert("redirect_uri", REDIRECT_URI);
    params.insert("code_verifier", code_verifier);

    let client_id = match provider {
        "anthropic" => ANTHROPIC_CLIENT_ID,
        _ => GITHUB_COPILOT_CLIENT_ID,
    };
    params.insert("client_id", client_id);

    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[oauth] exchange_code request error: {e}");
            format!("request error: {e}")
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[oauth] exchange_code failed ({status}): {body}");
        return Err(format!("token exchange failed: {status}"));
    }

    resp.json::<TokenResponse>().await.map_err(|e| {
        eprintln!("[oauth] exchange_code json parse error: {e}");
        format!("json parse error: {e}")
    })
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/// Refresh an access token using the stored refresh_token.
pub async fn refresh_token(provider: &str, refresh_tok: &str) -> Result<TokenResponse, String> {
    let token_url = match provider {
        "anthropic" => ANTHROPIC_TOKEN_URL,
        "github-copilot" => GITHUB_TOKEN_URL,
        other => {
            return Err(format!("[oauth] unknown provider for refresh: {other}"));
        }
    };

    let client = reqwest::Client::new();
    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("refresh_token", refresh_tok);

    let client_id = match provider {
        "anthropic" => ANTHROPIC_CLIENT_ID,
        _ => GITHUB_COPILOT_CLIENT_ID,
    };
    params.insert("client_id", client_id);

    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[oauth] refresh_token request error: {e}");
            format!("request error: {e}")
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[oauth] refresh_token failed ({status}): {body}");
        return Err(format!("token refresh failed: {status}"));
    }

    resp.json::<TokenResponse>().await.map_err(|e| {
        eprintln!("[oauth] refresh_token json parse error: {e}");
        format!("json parse error: {e}")
    })
}

// ---------------------------------------------------------------------------
// auth.json writer
// ---------------------------------------------------------------------------

/// Write ~/.gsd/auth.json with provider + token data.
/// Creates ~/.gsd/ directory if it does not exist.
pub fn write_auth_json(
    provider: &str,
    access_token: &str,
    refresh_token: Option<&str>,
    expires_at: Option<&str>,
) -> Result<(), String> {
    let gsd_dir = gsd_dir()?;
    fs::create_dir_all(&gsd_dir).map_err(|e| {
        eprintln!("[oauth] write_auth_json mkdir error: {e}");
        format!("mkdir error: {e}")
    })?;

    let path = gsd_dir.join("auth.json");

    let mut obj = serde_json::json!({
        "provider": provider,
        "access_token": access_token,
    });

    if let Some(rt) = refresh_token {
        obj["refresh_token"] = serde_json::Value::String(rt.to_string());
    }
    if let Some(ea) = expires_at {
        obj["expires_at"] = serde_json::Value::String(ea.to_string());
    }

    let content = serde_json::to_string_pretty(&obj).map_err(|e| {
        eprintln!("[oauth] write_auth_json serialize error: {e}");
        format!("serialize error: {e}")
    })?;

    fs::write(&path, content).map_err(|e| {
        eprintln!("[oauth] write_auth_json write error: {e}");
        format!("write error: {e}")
    })?;

    Ok(())
}

/// Delete ~/.gsd/auth.json if it exists. Does not error if missing.
pub fn delete_auth_json() -> Result<(), String> {
    let gsd_dir = gsd_dir()?;
    let path = gsd_dir.join("auth.json");
    if path.exists() {
        fs::remove_file(&path).map_err(|e| {
            eprintln!("[oauth] delete_auth_json error: {e}");
            format!("delete error: {e}")
        })?;
    }
    Ok(())
}

fn gsd_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "[oauth] cannot resolve HOME directory".to_string())?;
    Ok(PathBuf::from(home).join(".gsd"))
}
