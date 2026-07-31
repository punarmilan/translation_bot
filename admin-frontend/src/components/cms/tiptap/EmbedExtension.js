import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Generic video/embed node. Rendered as an <iframe> -- the backend sanitizer
 * (admin-backend/app/cms/sanitize.py) only allows iframe "src" hosts on an
 * explicit allowlist (YouTube, YouTube-nocookie, Vimeo), so any embed URL is
 * normalized to one of those hosts before insertion (see
 * RichTextEditor.jsx's insertEmbed).
 */
const EmbedExtension = Node.create({
  name: "embed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: "" },
      width: { default: "100%" },
      height: { default: "315" },
    };
  },

  parseHTML() {
    return [{ tag: "iframe[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "iframe",
      mergeAttributes(HTMLAttributes, {
        frameborder: "0",
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        allowfullscreen: "true",
      }),
    ];
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export default EmbedExtension;
