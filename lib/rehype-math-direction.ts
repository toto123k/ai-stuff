import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";

export function rehypeMathDirection() {
    return (tree: Root) => {
        visit(tree, "element", (node: Element) => {
            if (
                node.tagName === "span" &&
                node.properties?.className &&
                Array.isArray(node.properties.className) &&
                node.properties.className.includes("katex")
            ) {
                node.properties.dir = "ltr";
                node.properties.className.push("text-left");
            }

            if (
                node.tagName === "div" &&
                node.properties?.className &&
                Array.isArray(node.properties.className) &&
                node.properties.className.includes("katex-display")
            ) {
                node.properties.dir = "ltr";
                node.properties.className.push("text-left");
            }
        });
    };
}
