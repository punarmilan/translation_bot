import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class IndustryProfilesService:
    def __init__(self) -> None:
        # Predefined industry profile vocabularies and jargon
        self._profiles = {
            "medical": {
                "name": "Medical & Healthcare",
                "description": "Clinical terms, anatomy, drug names, and common healthcare acronyms.",
                "vocabulary": ["myocardial infarction", "hypertension", "electrocardiogram", "ibuprofen", "STAT", "tachycardia"]
            },
            "legal": {
                "name": "Legal & Corporate",
                "description": "Contract clauses, litigation jargon, and legal terminology.",
                "vocabulary": ["force majeure", "indemnity", "jurisdiction", "subpoena", "plaintiff", "defendant", "affidavit"]
            },
            "tech": {
                "name": "Technology & Software",
                "description": "Programming terms, system architectures, cloud infrastructure, and DevOps jargon.",
                "vocabulary": ["kubernetes", "microservices", "websockets", "latency", "load balancer", "CI/CD", "database shard"]
            },
            "finance": {
                "name": "Finance & Banking",
                "description": "Market terms, trading jargon, accounting metrics, and financial tools.",
                "vocabulary": ["amortization", "liquidity", "EBITDA", "arbitrage", "yield curve", "volatility", "bear market"]
            }
        }

    async def list_profiles(self) -> List[Dict[str, Any]]:
        """
        Lists all available industry profiles.
        """
        return [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in self._profiles.items()
        ]

    async def get_profile_vocabulary(self, profile_id: str) -> List[str]:
        """
        Returns the customized vocabulary/jargon list for the specified industry profile.
        """
        profile = self._profiles.get(profile_id.lower())
        if not profile:
            logger.warning(f"Industry profile '{profile_id}' not found.")
            return []
        return profile["vocabulary"]

industry_profiles_service = IndustryProfilesService()
