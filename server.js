import 'dotenv/config';
import express from 'express';

const app = express();
const port = Number(process.env.API_PORT || 4174);
const apiBaseUrl = 'https://api.worldlabs.ai/marble/v1';
const maxImageBytes = 12 * 1024 * 1024;
const maxReferenceImages = 8;
const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const imageExtensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const maxChatMessages = 12;
const maxChatMessageLength = 1200;

app.use(express.json({ limit: '18mb' }));

class MarbleRequestError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

class LlmRequestError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getLlmConfig() {
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const model = process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const baseUrl = process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1';
  let endpoint;
  try {
    endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/chat/completions`);
  } catch {
    throw new LlmRequestError('LLM_BASE_URL in .env must be a valid API base URL.', 503);
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new LlmRequestError('LLM_BASE_URL in .env must be an HTTP or HTTPS API base URL without credentials, a query, or a fragment.', 503);
  }
  return { apiKey, model, endpoint };
}

function getLlmReply(contentType, body) {
  const isEventStream = contentType.includes('text/event-stream') || /^\s*(?:data:|:)/m.test(body);
  let payload;

  if (isEventStream) {
    const content = [];
    const events = body.split(/\r?\n\r?\n/);
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data || data === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        throw new LlmRequestError('The custom LLM returned malformed streaming data. Check that LLM_BASE_URL points to an OpenAI-compatible chat-completions endpoint.');
      }

      if (chunk.error) {
        const detail = typeof chunk.error.message === 'string' ? `: ${chunk.error.message.slice(0, 240)}` : '';
        throw new LlmRequestError(`The custom LLM reported an error${detail}`);
      }

      for (const choice of chunk.choices || []) {
        const text = choice.delta?.content ?? choice.message?.content ?? choice.text;
        if (typeof text === 'string') content.push(text);
      }
    }

    const reply = content.join('');
    if (!reply.trim()) {
      throw new LlmRequestError('The custom LLM stream contained no reply text. Check that the selected model supports chat completions.');
    }
    return reply.trim();
  }

  try {
    payload = JSON.parse(body);
  } catch {
    throw new LlmRequestError('The custom LLM returned neither JSON nor a valid event stream. Check LLM_BASE_URL and its chat-completions response format.');
  }

  if (payload.error) {
    const detail = typeof payload.error.message === 'string' ? `: ${payload.error.message.slice(0, 240)}` : '';
    throw new LlmRequestError(`The custom LLM reported an error${detail}`);
  }

  const reply = payload.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new LlmRequestError('The custom LLM returned an empty reply. Check that the selected model supports chat completions.');
  }
  return reply.trim();
}

function parseWorldReference(value) {
  const reference = typeof value === 'string' ? value.trim() : '';
  if (!reference) throw new MarbleRequestError('Paste a Marble world page URL or world ID.', 400);

  let worldId = reference;
  if (/^(https?:\/\/|www\.|marble\.worldlabs\.ai\/)/i.test(reference)) {
    let url;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(reference) ? reference : `https://${reference}`);
    } catch {
      throw new MarbleRequestError('That Marble world URL is not valid.', 400);
    }
    if (url.protocol !== 'https:' || !['marble.worldlabs.ai', 'www.marble.worldlabs.ai'].includes(url.hostname)) {
      throw new MarbleRequestError('Use a world page link from marble.worldlabs.ai.', 400);
    }

    let segments;
    try {
      segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    } catch {
      throw new MarbleRequestError('That Marble world URL contains invalid characters.', 400);
    }
    const worldIndex = segments.findIndex((segment) => segment === 'worlds' || segment === 'world' || segment === 'worldvr');
    const pathId = worldIndex < 0
      ? null
      : segments[worldIndex + 1] === 'api'
        ? segments[worldIndex + 2]
        : segments[worldIndex + 1];
    worldId = url.searchParams.get('world_id')
      || url.searchParams.get('worldId')
      || url.searchParams.get('id')
      || pathId;
  }

  if (typeof worldId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(worldId)) {
    throw new MarbleRequestError('Paste the URL of an individual Marble world or its world ID. The API worlds list URL does not identify a world.', 400);
  }
  return worldId;
}

function toBrowserWorld(world, worldId, quality = 'draft', imported = false) {
  const splatUrls = world.assets?.splats?.spz_urls || {};
  const resolutionOrder = quality === 'full'
    ? ['full_res', '500k', '100k']
    : quality === 'balanced'
      ? ['500k', 'full_res', '100k']
      : ['100k', '500k', 'full_res'];
  const splatUrl = resolutionOrder.map((resolution) => splatUrls[resolution]).find(Boolean);
  if (!splatUrl) throw new MarbleRequestError('This Marble world does not have a browser-loadable SPZ asset.');

  return {
    id: world.world_id || worldId,
    title: world.display_name || world.assets?.caption || 'Generated world',
    subtitle: imported ? 'Imported from Marble · World API' : 'Generated by Marble · Image to world',
    created: 'Today',
    image: world.assets?.thumbnail_url || '/images/alpine-world.png',
    tint: 'blue',
    splatUrl,
    colliderMeshUrl: world.assets?.mesh?.collider_mesh_url || null,
    metricScale: world.assets?.splats?.semantics_metadata?.metric_scale_factor || 1,
    marbleUrl: world.world_marble_url || null,
  };
}

async function marbleRequest(resourcePath, options = {}) {
  const apiKey = process.env.WLT_API_KEY?.trim();
  if (!apiKey) {
    throw new MarbleRequestError('Add WLT_API_KEY to the project .env file, then restart the prototype.', 503);
  }

  const response = await fetch(`${apiBaseUrl}/${resourcePath}`, {
    ...options,
    headers: {
      'WLT-Api-Key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { message: responseText };
  }

  if (!response.ok) {
    const apiMessage = payload.message || payload.detail?.[0]?.msg || payload.detail || `Marble API returned ${response.status}.`;
    throw new MarbleRequestError(typeof apiMessage === 'string' ? apiMessage : JSON.stringify(apiMessage), response.status);
  }
  return payload;
}

app.get('/api/health', (_request, response) => {
  response.json({
    apiConfigured: Boolean(process.env.WLT_API_KEY?.trim()),
    maraChatConfigured: Boolean(process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()),
  });
});

app.post('/api/mara/chat', async (request, response, next) => {
  try {
    const { apiKey, model, endpoint } = getLlmConfig();
    if (!apiKey) {
      throw new LlmRequestError('Set LLM_API_KEY in the project .env file, then restart the server to chat with Mara.', 503);
    }

    const { messages, worldTitle } = request.body || {};
    if (
      !Array.isArray(messages)
      || messages.length < 1
      || messages.length > maxChatMessages
      || messages.some((message) => (
        !message
        || !['user', 'assistant'].includes(message.role)
        || typeof message.content !== 'string'
        || !message.content.trim()
        || message.content.length > maxChatMessageLength
      ))
      || messages[messages.length - 1]?.role !== 'user'
    ) {
      throw new LlmRequestError('Mara chat needs up to 12 recent user and assistant messages, with your message last.', 400);
    }

    const title = typeof worldTitle === 'string' ? worldTitle.trim().slice(0, 120) : '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let llmResponse;
    let llmResponseBody;
    try {
      llmResponse = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are Mara, a friendly, thoughtful guide who is standing with the visitor in the 3D world "${title || 'their world'}". Speak naturally in first person, answer the visitor's questions, and keep replies warm and concise (usually 1–3 sentences). You can discuss what the visitor tells you and offer gentle things to explore, but you cannot actually see the scene or the visitor, so do not claim to observe details that have not been provided. Stay in character as Mara without pretending to be a real person.`,
            },
            ...messages.map(({ role, content }) => ({ role, content: content.trim() })),
          ],
          max_tokens: 300,
          temperature: 0.8,
        }),
      });
      llmResponseBody = await llmResponse.text();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new LlmRequestError('Mara is taking too long to reply. Please try again.', 504);
      }
      throw new LlmRequestError('Could not reach the LLM provider. Check LLM_BASE_URL in .env and the server connection.', 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!llmResponse.ok) {
      if (llmResponse.status === 401 || llmResponse.status === 403) {
        throw new LlmRequestError('The LLM provider rejected the configured API key. Check LLM_API_KEY in .env.', 502);
      }
      if (llmResponse.status === 429) {
        throw new LlmRequestError('The LLM provider is rate-limiting requests right now. Please try again shortly.', 429);
      }
      throw new LlmRequestError(`The custom LLM returned HTTP ${llmResponse.status}. Check LLM_MODEL and confirm the provider accepts OpenAI-compatible chat-completions requests.`, 502);
    }

    const reply = getLlmReply(llmResponse.headers.get('content-type') || '', llmResponseBody);
    response.json({ reply });
  } catch (error) {
    next(error);
  }
});

app.post('/api/media-assets/upload', express.raw({ type: [...allowedImageTypes], limit: maxImageBytes }), async (request, response, next) => {
  try {
    const contentType = request.headers['content-type']?.split(';')[0].toLowerCase();
    if (!allowedImageTypes.has(contentType) || !Buffer.isBuffer(request.body) || !request.body.length) {
      response.status(400).json({ error: 'Choose a non-empty PNG, JPG, or WEBP image.' });
      return;
    }

    let originalName;
    try {
      originalName = decodeURIComponent(request.get('x-file-name') || 'reference-image');
    } catch {
      response.status(400).json({ error: 'The image file name is invalid.' });
      return;
    }
    const extension = imageExtensions[contentType];
    const baseName = originalName.split(/[\\/]/).pop().replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64 - extension.length - 1);
    const fileName = `${baseName || 'reference-image'}.${extension}`;
    const prepared = await marbleRequest('media-assets:prepare_upload', {
      method: 'POST',
      body: JSON.stringify({ file_name: fileName, kind: 'image', extension }),
    });
    const mediaAssetId = prepared.media_asset?.media_asset_id;
    const uploadInfo = prepared.upload_info;
    if (!mediaAssetId || !uploadInfo?.upload_url) throw new MarbleRequestError('World Labs did not provide an image upload location.');

    const uploadHeaders = Object.fromEntries(
      Object.entries(uploadInfo.required_headers || {}).filter(([, value]) => typeof value === 'string'),
    );
    if (!Object.keys(uploadHeaders).some((header) => header.toLowerCase() === 'content-type')) {
      uploadHeaders['Content-Type'] = contentType;
    }
    const uploadResponse = await fetch(uploadInfo.upload_url, {
      method: uploadInfo.upload_method || 'PUT',
      headers: uploadHeaders,
      body: request.body,
    });
    if (!uploadResponse.ok) {
      throw new MarbleRequestError(`World Labs could not upload ${fileName} (${uploadResponse.status}).`);
    }
    response.status(201).json({ mediaAssetId });
  } catch (error) {
    next(error);
  }
});

app.post('/api/worlds/generate', async (request, response, next) => {
  try {
    const { mode, imageAssetIds, prompt = '', quality = 'draft' } = request.body || {};
    const textPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 500) : '';
    let worldPrompt;

    if (mode === 'image') {
      if (!Array.isArray(imageAssetIds) || imageAssetIds.length < 1 || imageAssetIds.length > maxReferenceImages || imageAssetIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200)) {
        response.status(400).json({ error: `Choose between 1 and ${maxReferenceImages} reference images.` });
        return;
      }
      worldPrompt = imageAssetIds.length === 1
        ? {
          type: 'image',
          image_prompt: { source: 'media_asset', media_asset_id: imageAssetIds[0] },
          text_prompt: textPrompt || null,
          disable_recaption: false,
        }
        : {
          type: 'multi-image',
          multi_image_prompt: imageAssetIds.map((mediaAssetId) => ({
            content: { source: 'media_asset', media_asset_id: mediaAssetId },
          })),
          // Reconstruction mode rebuilds the photographed space instead of loosely
          // using the images as hints; it needs images of one space with the same aspect ratio.
          reconstruct_images: true,
          text_prompt: textPrompt || null,
          disable_recaption: false,
        };
    } else if (mode !== 'text' || !textPrompt) {
      response.status(400).json({ error: 'Add an image or a text prompt to create a world.' });
      return;
    } else {
      worldPrompt = {
        type: 'text',
        text_prompt: textPrompt,
        disable_recaption: false,
        image_prompt: null,
      };
    }

    const operation = await marbleRequest('worlds:generate', {
      method: 'POST',
      body: JSON.stringify({
        world_prompt: worldPrompt,
        model: 'marble-1.1-plus',
      }),
    });

    if (!operation.operation_id) {
      throw new MarbleRequestError('Marble accepted the request but did not return an operation ID.');
    }
    response.status(202).json({ operationId: operation.operation_id });
  } catch (error) {
    next(error);
  }
});

app.post('/api/worlds/import', async (request, response, next) => {
  try {
    const worldId = parseWorldReference(request.body?.worldReference);
    const world = await marbleRequest(`worlds/${encodeURIComponent(worldId)}`);
    response.json({ world: toBrowserWorld(world, worldId, request.body?.quality, true) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/worlds/operations/:operationId', async (request, response, next) => {
  try {
    const { operationId } = request.params;
    // Marble operation IDs are opaque; accept their safe URL-safe characters
    // without assuming a particular prefix (for example, "op_").
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(operationId)) {
      response.status(400).json({ error: 'Invalid Marble operation ID.' });
      return;
    }

    const operation = await marbleRequest(`operations/${encodeURIComponent(operationId)}`);
    if (!operation.done) {
      response.json({ done: false });
      return;
    }
    if (operation.error) {
      const detail = operation.error.message || operation.error.detail || 'World generation failed.';
      response.json({ done: true, error: String(detail) });
      return;
    }

    const worldId = operation.response?.world_id;
    if (!worldId) throw new MarbleRequestError('The completed operation did not include a world ID.');

    const world = await marbleRequest(`worlds/${encodeURIComponent(worldId)}`);
    response.json({
      done: true,
      world: toBrowserWorld(world, worldId, request.query.quality),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ error: 'The image payload is too large. Choose an image smaller than 12 MB.' });
    return;
  }
  const statusCode = error instanceof MarbleRequestError || error instanceof LlmRequestError ? error.statusCode : 502;
  response.status(statusCode).json({ error: error.message || 'The request failed.' });
});

app.listen(port, () => console.log(`Wyntrr API proxy listening at http://localhost:${port}`));
