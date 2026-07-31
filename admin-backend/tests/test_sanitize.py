"""Unit tests for the CMS rich-text HTML sanitizer (app/cms/sanitize.py).

These run without any database/HTTP fixture since sanitize_richtext is a
pure function -- they exercise the allowlist directly, independent of the
CMS router tests in test_cms.py.
"""

from app.cms.sanitize import sanitize_richtext, sanitize_section, sanitize_sections


def test_strips_script_tags_entirely():
    assert "script" not in sanitize_richtext("<p>hi</p><script>alert(1)</script>")
    assert "alert(1)" not in sanitize_richtext("<p>hi</p><script>alert(1)</script>")


def test_strips_event_handler_attributes():
    cleaned = sanitize_richtext("<img src='x.png' onerror=\"alert('xss')\">")
    assert "onerror" not in cleaned
    assert "alert" not in cleaned


def test_strips_javascript_href_scheme():
    cleaned = sanitize_richtext("<a href=\"javascript:alert(1)\">click</a>")
    assert "javascript:" not in cleaned


def test_keeps_known_good_formatting_tags():
    cleaned = sanitize_richtext("<p><strong>bold</strong> and <em>italic</em> and <u>underline</u></p>")
    assert "<strong>bold</strong>" in cleaned
    assert "<em>italic</em>" in cleaned
    assert "<u>underline</u>" in cleaned


def test_keeps_headings_lists_blockquote_code_table():
    html = (
        "<h2>Title</h2><ul><li>one</li></ul><ol><li>two</li></ol>"
        "<blockquote>quote</blockquote><pre><code>code</code></pre>"
        "<table><tr><td>cell</td></tr></table>"
    )
    cleaned = sanitize_richtext(html)
    assert "<h2>Title</h2>" in cleaned
    assert "<li>one</li>" in cleaned
    assert "<blockquote>quote</blockquote>" in cleaned
    assert "<table>" in cleaned


def test_adds_safe_rel_to_links_without_crashing():
    cleaned = sanitize_richtext('<a href="https://example.com">link</a>')
    assert 'href="https://example.com"' in cleaned
    assert "noopener" in cleaned


def test_allows_iframe_from_allowlisted_host():
    cleaned = sanitize_richtext('<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>')
    assert "youtube-nocookie.com" in cleaned


def test_strips_iframe_from_non_allowlisted_host():
    cleaned = sanitize_richtext('<iframe src="https://evil.example.com/payload"></iframe>')
    assert "evil.example.com" not in cleaned


def test_keeps_rt_button_class_on_anchor():
    cleaned = sanitize_richtext('<a class="rt-button" href="/signup">Go</a>')
    assert 'class="rt-button"' in cleaned


def test_empty_input_returns_empty_string():
    assert sanitize_richtext("") == ""
    assert sanitize_richtext(None) == ""


def test_sanitize_section_only_touches_richtext_fields():
    schema = {"fields": [{"key": "body", "type": "richtext"}, {"key": "title", "type": "text"}]}
    section = {"body": "<script>alert(1)</script><p>ok</p>", "title": "<script>alert(2)</script>ignored as plain text"}
    cleaned = sanitize_section(section, schema)
    assert "script" not in cleaned["body"]
    # Non-richtext fields are left untouched by this function -- they're
    # rendered as plain text on the public site, so raw "<script>" there is
    # inert text, not markup.
    assert cleaned["title"] == section["title"]


def test_sanitize_section_with_no_schema_is_a_noop():
    section = {"body": "<script>alert(1)</script>"}
    assert sanitize_section(section, None) == section


def test_sanitize_sections_dispatches_per_section_type():
    def get_schema(type_key):
        if type_key == "hero":
            return {"fields": [{"key": "body", "type": "richtext"}]}
        return None

    sections = [
        {"type": "hero", "body": "<script>bad</script><p>hero body</p>"},
        {"type": "unknown-type", "body": "<script>bad</script>"},
    ]
    cleaned = sanitize_sections(sections, get_schema)
    assert "script" not in cleaned[0]["body"]
    assert cleaned[1]["body"] == "<script>bad</script>"  # untouched: no schema for this type
