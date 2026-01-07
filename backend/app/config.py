from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    model_name: str | None = None


settings = Settings()
