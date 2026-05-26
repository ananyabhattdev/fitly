# Fitly

Fitly is a dependency-free progressive web app for a personal fitness plan, daily tracker, and history.

## Why this stack

The app is built with plain HTML, CSS, and JavaScript so it can be deployed to GitHub Pages without a build step. Instead of SQLite, Fitly uses browser local storage because GitHub Pages is static hosting and does not provide a server-side database. This keeps the app offline-friendly and simple to deploy.

## Features

- First-run profile setup: name, age, height, gender, current weight, and target weight.
- Auto-generated plan: daily steps, water target, meal timing in four chunks, calories, BMI, and extra habits.
- Daily tracker: steps, water, meals, sleep, mood, workout, and notes with autosave.
- History view with completion summaries.
- Offline-first PWA with a web manifest and service worker.

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings > Pages`.
3. Set the source to `Deploy from a branch`.
4. Select the branch and root folder.
5. Save, then open the published Pages URL.

Because all paths are relative, Fitly works from a repository subpath such as `https://username.github.io/fitly/`.
