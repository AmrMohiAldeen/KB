import {
  MAX_PASTED_NODE_COUNT,
  MAX_SANITIZE_DEPTH,
} from './pasteSanitizerConfig';

export function removeComments(root: ParentNode): void {
  const document = root.ownerDocument;

  // NodeFilter is a browser DOM helper used by TreeWalker to decide which node types to visit.
  // Here we use SHOW_COMMENT so the walker only finds HTML comment nodes.
  const nodeFilter = document?.defaultView?.NodeFilter;
  const showComment = nodeFilter?.SHOW_COMMENT;

  // If the DOM APIs are unavailable, skip safely instead of crashing
  if (showComment == null || !document?.createTreeWalker) return;

  const walker = document.createTreeWalker(root, showComment);
  const comments: Comment[] = [];

  // Collect comments first because removing nodes while walking can make traversal unreliable.
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  
  comments.forEach((comment) => comment.remove());
}

export function hasAcceptableNodeCount(root: Node): boolean {
  let count = 0;
  const stack = Array.from(root.childNodes);

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    count += 1;
    if (count > MAX_PASTED_NODE_COUNT) return false;

    stack.push(...Array.from(node.childNodes));
  }

  return true;
}

export function hasAcceptableDepth(root: Node): boolean {
  const stack = Array.from(root.childNodes).map((node) => ({
    depth: 1,
    node,
  }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.depth > MAX_SANITIZE_DEPTH) return false;

    Array.from(current.node.childNodes).forEach((child) => {
      stack.push({ depth: current.depth + 1, node: child });
    });
  }

  return true;
}
