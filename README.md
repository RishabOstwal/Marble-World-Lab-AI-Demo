# Wyntrr World Studio prototype

A responsive React UI prototype for the world generation and exploration flow.

The Marble viewer displays a full loading panel while downloading and preparing the world. The scene is revealed after splats are initialized, sorted, and rendered, and collision setup has completed. If the collider is unavailable or fails, the world still opens in free-move mode. Download completion alone does not mark the scene ready.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

The server reads the project's `.env` file, not `.env.example`. Set `WLT_API_KEY` to a project-scoped World Labs API key for world generation. Mara uses `LLM_BASE_URL` (an OpenAI-compatible API base URL ending in `/v1`), `LLM_MODEL`, and `LLM_API_KEY` from `.env`. Restart the dev command after changing these settings. The legacy `OPENAI_API_KEY` and `OPENAI_MODEL` names remain supported when the corresponding `LLM_*` values are absent; the default provider is OpenAI and the default model is `gpt-4o-mini`. Keys stay in the local Express server and are never sent to the browser.

Choose **Image input**, upload 1–8 PNG, JPG, or WEBP images (up to 12 MB each), and press **Generate world**. For a multi-image world, use sharp, well-lit views of the same place with matching dimensions and some overlap. The server uploads each image to Marble, submits them in reconstruction mode, polls the asynchronous operation, and opens the generated world in Spark. Full quality uses the highest available Gaussian splat resolution; Draft uses 100k for faster previews. Generated output is currently kept in page memory; persistent storage and account authentication still need integration.

The built-in alpine scene remains available as a local viewer preview. It includes a sample exploration loop: collect three fireflies, discover four field notes, use the live map to locate landmarks, toggle the trail lantern and campfire, toss stones to make lake ripples, listen to generated ambient and footstep audio, and switch between dusk, golden hour, and mist. Talk to Mara, the trail guide, by aiming at her and pressing **E** or clicking; choose a dialogue prompt to hear about the lake or fireflies. Click an interaction or aim at it and press **E**; click the lake to toss a stone while exploring. Press **M** or use the **Map** button to open the top-down map. Use the field-guide buttons to change lighting, mist, and sound. These sample interactions are rendered as Three.js scene objects and effects.

Generated Marble worlds load in a first-person preview: drag to look, use **WASD** to move, hold **Shift** to sprint, and press **Space** to jump. When Marble provides a paired collider mesh, it supplies walkable surfaces and collision boundaries. The preview places Mara, the trail guide, near the starting point; aim at her and press **E** or click to open a conversation. Type a message and send it to chat with her using the LLM configured in `.env`. You can also collect gems, inspect glowing points of interest, and add notes.

To replace Mara's appearance in a loaded Marble world, choose **Replace 3D model** in the viewer and select one self-contained `.glb` file up to 100 MB. The character is scaled to about 1.6 m tall and keeps Mara's existing talk interaction. Choose **Restore Mara** to return to the built-in character. The replacement is kept only for the current page session and is not uploaded or saved.

The Modern Living and Dining Room at `marble.worldlabs.ai/worldvr/d34de01c-bb93-4aac-bed8-234af788d18c` is the startup world. The app loads its 500k balanced splat and paired collider when available. To open another existing world, choose **Import from Marble** in the **Your worlds** toolbar and paste its individual world page URL or world ID. The Marble API worlds listing URL does not identify a specific world. Imported worlds are added to the current in-memory library.

### Voice chat with Mara

Mara's chat uses a dark, rounded panel docked on the right so the character remains visible in the center of the world. In narrow viewers, it becomes a compact bottom panel, leaving the upper scene visible. The conversation scrolls above an integrated message composer. Press **Enter** to send, or **Shift+Enter** for a new line. The microphone icon records your message, the upward arrow sends it, and **Stop voice** interrupts Mara's current spoken reply.

In Mara's Marble-world chat, select the microphone icon (**Use microphone**), allow microphone access, and speak. After recognition finishes, review the transcription in the message box and send it. Mara's new AI replies are read aloud automatically when browser speech synthesis is supported. Select **Stop voice** to interrupt playback. Starting the microphone stops playback to avoid transcribing Mara's voice; closing the conversation stops both recording and playback.

Voice uses the browser's Web Speech APIs and requires no additional API key. Microphone recognition needs a supported browser (such as Chrome or Edge), microphone permission, and HTTPS or localhost. Depending on the browser, speech recognition may send audio to the browser vendor's service and require an internet connection. Text chat remains available if voice is unsupported or fails. The LLM settings in `.env` are still required for AI replies.

Mara's mouth animates during spoken playback and closes when speech ends, is interrupted, or the chat closes. This is a procedural speaking animation, not phoneme-accurate lip sync.
