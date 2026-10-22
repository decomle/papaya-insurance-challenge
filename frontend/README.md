# Claims workflow UI

The React + Vite + Tailwind demo runs from the repository root:

```sh
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The UI reads available transitions and precondition descriptions from `config/state-machine.json`. Sample claim data and changes are held in browser memory for the current session; mock side effects are written to the browser console.

Create a production bundle with `npm run build:frontend`.
