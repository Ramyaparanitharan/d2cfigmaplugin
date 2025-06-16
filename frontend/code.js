figma.showUI(__html__, { width: 1000, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'fetch-figma-images') {
    const figmaUrl = msg.figmaUrl;
    const token = msg.figmaApiToken;

    const fileKeyMatch = figmaUrl.match(/(?:file|design)\/([a-zA-Z0-9]+)\//);
    const fileKey = fileKeyMatch ? fileKeyMatch[1] : null;

    if (!fileKey) {
      figma.notify("❌ Invalid Figma URL");
      return;
    }

    try {
      const headers = { 'X-Figma-Token': token };
      const fileResponse = await fetch(`https://api.figma.com/v1/files/${fileKey}`, { headers });
      const fileData = await fileResponse.json();

      if (!fileData || !fileData.document || !fileData.document.children) {
        figma.notify("❌ Could not parse Figma file");
        return;
      }

      const extractFrames = (node) => {
        const frames = [];
        const walk = (child) => {
          if (["FRAME", "COMPONENT", "INSTANCE"].includes(child.type)) {
            frames.push({ id: child.id, name: child.name });
          }
          if (child.children) child.children.forEach(walk);
        };
        fileData.document.children.forEach(walk);
        return frames;
      };

      const frames = extractFrames(fileData.document);
      if (frames.length === 0) {
        figma.notify("❌ No frames found in the Figma file");
        return;
      }

      const chunkArray = (array, size) => {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
          result.push(array.slice(i, i + size));
        }
        return result;
      };

      const frameChunks = chunkArray(frames, 100);
      const resultFrames = [];

      for (const chunk of frameChunks) {
        const ids = chunk.map(f => f.id).join(',');
        const imagesResponse = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${ids}&format=png`, { headers });
        const imageData = await imagesResponse.json();

        chunk.forEach(frame => {
          const url = imageData.images[frame.id];
          if (url) {
            resultFrames.push({ id: frame.id, name: frame.name, url });
          }
        });
      }

      const cleanedFrames = resultFrames.filter(f => f.url);
      if (cleanedFrames.length === 0) {
        figma.notify("❌ No renderable frames found");
        return;
      }

      figma.ui.postMessage({ type: 'image-frames', frames: cleanedFrames });

    } catch (err) {
      figma.notify("❌ Error fetching from Figma API");
      console.error(err);
    }
  }
};
