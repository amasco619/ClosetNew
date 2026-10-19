const references = new Map<string, number>();
const releaseListeners = new Set<() => void>();

export function retainManagedPhotoReference(uri: string): () => void {
  references.set(uri, (references.get(uri) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = references.get(uri) ?? 0;
    if (count <= 1) references.delete(uri);
    else references.set(uri, count - 1);
    releaseListeners.forEach(listener => listener());
  };
}

export function getActiveManagedPhotoReferences(): ReadonlySet<string> {
  return new Set(references.keys());
}

export function subscribeToManagedPhotoReferenceRelease(listener: () => void): () => void {
  releaseListeners.add(listener);
  return () => releaseListeners.delete(listener);
}
