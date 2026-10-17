"""Builds frontmatter-vs-pyyaml.json: what PyYAML reads from each frontmatter case below.

test/frontmatter-vs-pyyaml.test.mjs compares the tool's reader (src/frontmatter.mjs) with it.
The frontmatter is the text between the first "---" line and the next one, with the line break
that ends its last line (the closing "---" sits on the line after it), so a block scalar at the
end of the frontmatter ends with a line break, as it does in the file.

Run from this folder, with PyYAML installed (pip install pyyaml):  python frontmatter-vs-pyyaml.py
"""
import datetime
import json
import os
import platform
import re

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
cases = {}


def add(name, body=None, text=None):
    if text is None:
        text = "---\n" + body + "\n---\nBody line.\n"
    assert name not in cases, name
    cases[name] = text


# ---- A. quotes and escapes
add("dq-escaped-quote", 'name: "say \\"hi\\" now"')
add("dq-backslash", 'name: "a \\\\ b"')
add("dq-tab-escape", 'name: "a\\tb"')
add("dq-newline-escape", 'name: "a\\nb"')
add("dq-unicode-escape", 'name: "caf\\u00e9"')
add("dq-hex-escape", 'name: "\\x41"')
add("dq-upper-u-escape", 'name: "\\U0001F600"')
add("dq-u-escape-too-big", 'name: "\\UFFFFFFFF"')
add("dq-x-escape-short", 'name: "\\x4"')
add("dq-single-quote-escape-invalid", 'name: "it\\\'s"')
add("dq-escaped-space", 'name: "a\\ b"')
add("dq-line-continuation", 'description: "a\\\n  b"')
add("dq-line-continuation-space", 'description: "a \\\n  b"')
add("sq-doubled", "name: 'it''s'")
add("sq-backslash", "name: 'a\\b'")
add("sq-with-dq-inside", "name: 'say \"hi\"'")
add("dq-with-sq-inside", 'name: "it\'s"')
add("dq-empty", 'name: ""')
add("sq-empty", "name: ''")
add("dq-trailing-text", 'name: "quoted" extra')
add("dq-trailing-comment", 'name: "quoted" # c')
add("dq-unclosed", 'name: "abc')
add("sq-unclosed-then-key", "name: 'abc\ndescription: x")
add("dq-null-text", 'name: "null"')
# ---- B. comments
add("comment-after-space", "name: deploy # note")
add("comment-no-space-after-hash", "name: deploy #note")
add("hash-no-space-before", "name: deploy#note")
add("hash-in-dq", 'name: "a # b"')
add("hash-in-sq", "name: 'a # b'")
add("only-comment", "name: # just a comment")
add("hash-start-no-space", "name: #tag")
add("tab-before-hash", "name: deploy\t# note")
add("tab-in-comment", "name: a # x\ty")
add("comment-line-between-keys", "name: a\n# c\ndescription: b")
add("indented-comment-line-between-keys", "name: a\n  # c\ndescription: b")
add("hash-after-quote-char", 'name: a "#" b')
add("null-then-comment", "name: ~ # c")
# ---- C. wrapping / continuation
add("wrap-indented", "description: first line\n  second line")
add("wrap-two-lines-diff-indent", "description: first\n    second\n  third")
add("wrap-blank-line", "description: first\n\n  second")
add("wrap-then-comment-line", "description: first\n  # c\n  second")
add("wrap-with-colon-space", "description: first\n  b: c")
add("wrap-with-dash", "description: first\n  - item")
add("wrap-with-hash-inside", "description: first\n  second # c")
add("wrap-trailing-spaces", "description: a  \n  b")
add("next-line-value", "description:\n  text here")
add("next-line-multi", "description:\n  a\n  b")
add("next-line-blank-then", "description:\n\n  a")
add("next-line-not-indented", "description:\nfoo")
add("next-line-quoted", 'description:\n  "quoted text"')
add("next-line-quoted-multi", 'description:\n  "a\n  b"')
add("dq-multiline", 'description: "first\n  second"')
add("sq-multiline", "description: 'first\n  second'")
add("dq-multiline-blank", 'description: "first\n\n  second"')
add("dq-closed-then-indented", 'name: "a"\n  b')
add("plain-comment-then-indented", "name: a # c\n  b")
add("tab-continuation", "description: first\n\tsecond")
add("tab-after-colon", "name:\tdeploy")
add("tab-before-colon", "name\t: x")
add("tab-in-plain-value", "name: a\tb")
add("tab-in-dq-value", 'name: "a\tb"')
add("tab-next-line-value", "description:\n\ttext")
add("dq-wrap-tab-indent", 'description: "a\n\tb"')
add("wrap-trailing-colon-then-key", "description: Use when:\nname: x")
# ---- D. block scalars
add("literal", "description: |\n  a\n  b")
add("literal-strip", "description: |-\n  a\n  b")
add("literal-keep", "description: |+\n  a\n\n\nname: x")
add("literal-clip-blank-lines", "description: |\n  a\n\n")
add("literal-keep-one-blank", "description: |+\n  a\n\n")
add("literal-strip-blank", "description: |-\n  a\n\n")
add("folded", "description: >\n  a\n  b")
add("folded-strip", "description: >-\n  a\n  b")
add("folded-keep", "description: >+\n  a\n\n\nname: x")
add("folded-blank-line", "description: >\n  a\n\n  b")
add("folded-clip-then-key", "description: >\n  a\n\nname: x")
add("folded-more-indented", "description: >\n  a\n    b\n  c")
add("folded-blank-then-more-indented", "description: >\n  a\n\n    b\n  c")
add("folded-more-indented-then-blank", "description: >\n  a\n    b\n\n  c")
add("folded-trailing-spaces", "description: >\n  a  \n  b")
add("literal-indent-indicator", "description: |2\n  a")
add("literal-indent-indicator-more", "description: |2\n  a\n   b")
add("folded-indent-indicator", "description: >1\n  a\n b")
add("literal-first-line-more-indented", "description: |\n    a\n  b")
add("block-with-comment", "description: | # c\n  a")
add("block-empty-then-key", "description: |\nname: x")
add("block-keep-only-blank", "description: |+\n\nname: x")
add("block-tab-indent", "description: |\n\ta")
add("literal-hash-line", "description: |\n  # not a comment\n  a")
add("literal-trailing-spaces", "description: |\n  a  \n  b")
add("folded-trailing-blank-lines-then-key", "description: >\n  a\n\n\nname: x")
add("folded-colon-space-inside", "description: >-\n  Use when: the user asks")
add("pipe-then-text", "description: |x")
add("gt-then-text", "description: >x")
# ---- E. lists and maps
add("list-indented", "tools:\n  - Read\n  - Grep")
add("list-unindented", "tools:\n- Read\n- Grep")
add("list-of-maps", "tools:\n  - name: a\n    x: y\n  - name: b")
add("nested-map", "meta:\n  a: 1\n  b: 2")
add("nested-map-deeper", "a:\n  b:\n    c: d")
add("flow-list", "tools: [Read, Grep]")
add("flow-list-multiline", "tools: [Read,\n  Grep]")
add("flow-list-quoted-item", 'tools: ["a, b", c]')
add("flow-list-sq-doubled", "tools: ['it''s', b]")
add("flow-list-nested", "tools: [[a, b], c]")
add("flow-list-tab-inside", "tools: [a,\tb]")
add("flow-map", "meta: {a: 1}")
add("flow-list-trailing", "tools: [a] b")
add("flow-empty", "tools: []")
add("list-empty-item", "tools:\n  -\n  - x")
add("list-item-colon", "tools:\n  - Use when: x")
add("list-with-comment", "tools:\n  # c\n  - Read")
add("list-tab-indent", "tools:\n\t- a")
add("map-blank-line-between", "meta:\n\n  a: 1")
add("top-level-list", "- a\n- b")
# ---- F. first characters
for ch, label in [("[draft] x", "bracket"), ("{x} y", "brace"), ("&a x", "amp"), ("!tag x", "bang"),
                  ("!!str 123", "bangbang"), ("*a", "star"), ("@x", "at"), ("`x", "backtick"), ("%x", "percent"),
                  ("- x", "dash-space"), ("-x", "dash-text"), ("? x", "q-space"), ("?x", "q-text"),
                  (": x", "colon-space"), (":x", "colon-text"), (", x", "comma"), ("] x", "rbracket"),
                  ("} x", "rbrace"), ("Use when: x", "colon-space-inside"), ("Use when:", "ends-colon"),
                  ("a:b", "colon-no-space"), ("http://x", "url"), ("12:30", "time"), ("#x", "hash-only"),
                  ("a\\b", "backslash-text"), ("'x", "sq-unclosed-start"), ("x'", "sq-end")]:
    add("first-" + label, "description: " + ch)
# ---- G. keys
add("key-dq", '"name": x')
add("key-sq", "'name': x")
add("key-dq-space", '"na me": x')
add("key-dq-escaped", '"na\\"me": x')
add("key-underscore", "my_key: x")
add("key-dot", "key.sub: x")
add("key-digit-first", "1key: x")
add("key-dash-digit", "key-1: x")
add("key-dash-text", "-x: y")
add("key-colon-text", ":x: y")
add("key-q-text", "?x: y")
add("key-leading-underscore", "_key: x")
add("key-space-inside", "my key: x")
add("key-space-before-colon", "name : x")
add("key-indented-mapping", "  name: x\n  description: y")
add("key-no-space-after-colon", "name:x")
add("key-no-space-after-colon-then-key", "name:x\ndescription: y")
add("key-uppercase", "Name: x")
add("key-duplicate", "name: a\nname: b")
add("key-explicit", "? name\n: x")
add("key-unicode", "näme: x")
# ---- H. empty and null
add("empty-value", "name:")
add("empty-value-then-key", "name:\ndescription: y")
add("tilde", "name: ~")
add("null-lower", "name: null")
add("null-cap", "name: Null")
add("null-upper", "name: NULL")
add("null-mixed", "name: nUll")
add("null-in-list", "tools:\n  - ~")
# ---- I. types
add("type-true", "v: true")
add("type-yes", "v: yes")
add("type-float", "v: 1.0")
add("type-date", "v: 2024-01-01")
add("type-hex", "v: 0x1A")
add("type-underscore-int", "v: 1_000")
add("type-quoted-true", 'v: "true"')
add("type-emoji", "description: 🚀 launch now")
add("type-non-ascii", "name: café")
# ---- J. structure (full text)
add("struct-never-closes", text="---\nname: x\nBody\n")
add("struct-delim-trailing-spaces", text="---  \nname: x\n---  \nBody\n")
add("struct-delim-trailing-tab", text="---\t\nname: x\n---\t\nBody\n")
add("struct-blank-line-before", text="\n---\nname: x\n---\nBody\n")
add("struct-leading-space-delim", text=" ---\nname: x\n---\nBody\n")
add("struct-second-doc", text="---\nname: a\n---\nname: b\n---\nBody\n")
add("struct-crlf", text="---\r\nname: x\r\ndescription: y\r\n---\r\nBody\r\n")
add("struct-cr-only", text="---\rname: x\rdescription: y\r---\rBody\r")
add("struct-mixed-endings", text="---\r\nname: x\ndescription: y\r\n---\nBody\n")
add("struct-bom", text="\ufeff---\nname: x\n---\nBody\n")
add("struct-bom-crlf", text="\ufeff---\r\nname: x\r\n---\r\nBody\r\n")
add("struct-dots-end", text="---\nname: x\n...\nBody\n")
add("struct-four-dash-close", text="---\nname: x\n----\nBody\n")
add("struct-four-dash-open", text="----\nname: x\n---\nBody\n")
add("struct-only-dashes", text="---")
add("struct-only-dashes-nl", text="---\n")
add("struct-empty-fm", text="---\n---\nBody\n")
add("struct-empty-fm-no-body", text="---\n---")
add("struct-comment-only-fm", text="---\n# c\n---\nBody\n")
add("struct-indented-close", text="---\nname: x\n ---\nBody\n")
add("struct-close-with-text", text="---\nname: x\n--- end\nBody\n")
add("struct-empty-file", text="")
add("struct-zero-then-blank", text="\n")
add("struct-blank-lines-between-keys", "name: a\n\n\ndescription: b")
add("struct-value-trailing-ws", "name: deploy   ")
add("struct-value-leading-ws", "name:    deploy")
add("struct-text-line-after-key", "name: a\nfoo")
add("struct-directive", text="%YAML 1.2\n---\nname: x\n---\nBody\n")
add("struct-crlf-literal-block", text="---\r\ndescription: |\r\n  a\r\n  b\r\n---\r\nBody\r\n")

OPEN = re.compile(r"^---[ \t]*(\r\n|\r|\n)")
CLOSE = re.compile(r"(\r\n|\r|\n)---[ \t]*(\r\n|\r|\n|$)")


def extract(text):
    text = text[1:] if text.startswith("\ufeff") else text
    opened = OPEN.match(text)
    if not opened:
        return None
    closed = CLOSE.search(text, opened.end() - 1)
    if not closed:
        return None
    return text[opened.end():closed.start()] + closed.group(1)


def normalize(value):
    if isinstance(value, (datetime.date, datetime.datetime)):
        return f"<{type(value).__name__} {value}>"
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [normalize(item) for item in value]
    if isinstance(value, bytes):
        return f"<bytes {value!r}>"
    return value


results = {}
for name, text in cases.items():
    body = extract(text)
    if body is None:
        results[name] = {"text": text, "yaml": {"status": "absent"}}
        continue
    try:
        results[name] = {"text": text, "yaml": {"status": "ok", "value": normalize(yaml.safe_load(body))}}
    except Exception as error:  # noqa: BLE001 - any PyYAML error is the result being recorded
        message = str(error).splitlines()[0]
        results[name] = {"text": text, "yaml": {"status": "error", "error": f"{type(error).__name__}: {message}"}}

out = {
    "about": "Each case is a file's text and what PyYAML read from the YAML between its first two --- lines "
             "(absent, a value, or an error). Built by frontmatter-vs-pyyaml.py in this folder; "
             "test/frontmatter-vs-pyyaml.test.mjs compares src/frontmatter.mjs against it.",
    "pyyaml": yaml.__version__,
    "python": platform.python_version(),
    "generated": datetime.date.today().isoformat(),
    "cases": results,
}
with open(os.path.join(HERE, "frontmatter-vs-pyyaml.json"), "w", encoding="utf-8", newline="\n") as handle:
    json.dump(out, handle, ensure_ascii=False, indent=1)
    handle.write("\n")
print(f"{len(results)} cases -> frontmatter-vs-pyyaml.json (PyYAML {yaml.__version__}, Python {platform.python_version()})")
