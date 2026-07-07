from datetime import datetime

from bson import ObjectId


def json_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_value(item) for item in value]
    return value


def serialize(document: dict) -> dict:
    return {key: json_value(value) for key, value in document.items()}
