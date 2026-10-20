import { useEffect, useState } from "react";
import { getImageBytes } from "../storage/images";

export function useImageBytes(imageId?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    getImageBytes(imageId).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageId]);
  return url;
}
