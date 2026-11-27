from typing import Literal
from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FS_", env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./futurestack.db"
    provider: Literal["demo", "compatible", "oci"] = "demo"
    model: str = ""
    model_url: str = "http://127.0.0.1:11434/v1"
    model_key: SecretStr | None = None
    compartment: str = ""
    oci_profile: str = "DEFAULT"
    oci_auth: Literal["config", "instance_principal"] = "config"
    oci_endpoint: str = ""
    workspace_token: SecretStr | None = None
    input_usd_per_million: float | None = Field(default=None, ge=0)
    output_usd_per_million: float | None = Field(default=None, ge=0)
    otlp_traces_url: str = ""
    langfuse_url: str = ""
    langfuse_public: str = ""
    langfuse_secret: SecretStr | None = None

    @model_validator(mode="after")
    def check_provider(self):
        if self.provider != "demo" and not self.model:
            raise ValueError("Set FS_MODEL to a model available to your account")
        if self.provider == "oci" and not self.compartment:
            raise ValueError("Set FS_COMPARTMENT for OCI inference")
        return self
