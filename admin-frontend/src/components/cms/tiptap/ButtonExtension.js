import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A CTA-style button embedded inside rich-text body copy. Renders as
 * <a class="rt-button" href="...">Label</a> -- the backend sanitizer
 * (admin-backend/app/cms/sanitize.py) allows the "class" attribute on <a>
 * tags specifically so this survives sanitization.
 */
const ButtonExtension = Node.create({
  name: "ctaButton",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      href: { default: "#" },
      label: { default: "Button" },
    };
  },

  parseHTML() {
    return [{ tag: "a.rt-button" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { class: "rt-button", href: node.attrs.href }),
      node.attrs.label,
    ];
  },

  addCommands() {
    return {
      setCtaButton:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export default ButtonExtension;
