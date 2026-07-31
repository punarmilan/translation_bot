"""HTML sanitization for CMS rich-text fields.

Rich-text section fields store editor-authored HTML (see
frontend RichTextEditor / TipTap) that is later rendered on the public site
via ``dangerouslySetInnerHTML``. Every such value must be sanitized here,
server-side, before it is persisted -- this is the authoritative pass; the
public frontend's DOMPurify pass is defense-in-depth only, not a substitute.
"""

from urllib.parse import urlparse

import nh3

_ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "h2", "h3", "h4",
    "ul", "ol", "li",
    "blockquote", "code", "pre",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "iframe",
}

_ALLOWED_ATTRIBUTES = {
    # "rel" is intentionally excluded: nh3/ammonia manages it via link_rel
    # below and panics if "rel" is also present in the attribute allowlist.
    "a": {"href", "target", "class"},
    "img": {"src", "alt", "width", "height", "class"},
    "iframe": {"src", "width", "height", "allow", "allowfullscreen", "frameborder", "class"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}

# Hosts allowed as iframe embed sources (video/embeds inserted via the editor).
_ALLOWED_IFRAME_HOSTS = {
    "www.youtube.com",
    "www.youtube-nocookie.com",
    "player.vimeo.com",
}


def _attribute_filter(tag: str, attribute: str, value: str) -> str | None:
    if tag == "iframe" and attribute == "src":
        host = urlparse(value).hostname or ""
        if host not in _ALLOWED_IFRAME_HOSTS:
            return None
    return value


def sanitize_richtext(html: str) -> str:
    """Sanitize one rich-text field's HTML to a safe, known-good subset."""
    if not html:
        return ""
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        attribute_filter=_attribute_filter,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow",
    )


def sanitize_section(section: dict, schema: dict | None) -> dict:
    """Sanitize every field in ``section`` whose schema field type is "richtext"."""
    if not schema:
        return section
    richtext_keys = {f["key"] for f in schema.get("fields", []) if f.get("type") == "richtext"}
    if not richtext_keys:
        return section
    cleaned = dict(section)
    for key in richtext_keys:
        if key in cleaned and isinstance(cleaned[key], str):
            cleaned[key] = sanitize_richtext(cleaned[key])
    return cleaned


def sanitize_sections(sections: list[dict], get_schema) -> list[dict]:
    """Sanitize every section in a page's section list.

    ``get_schema`` is a callable (type_key) -> schema, matching
    ``app.cms.section_types.get_section_type``, injected here rather than
    imported to avoid this module needing to know the registry's shape.
    """
    return [sanitize_section(section, get_schema(section.get("type"))) for section in sections]
