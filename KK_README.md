# KK Version

This is a custom version of TTYD, it have to be developed on branches starts with `KK-`, for examle `kk-dev`.
To build and develop there is a docker file you can use.

Loom walkthrough video

<div>
    <a href="https://www.loom.com/share/af44a3fb1c4f4998bf174b62d51c19a9">
      <p>Explaining the KK TTYD repo/app 📹 - Watch Video</p>
    </a>
    <a href="https://www.loom.com/share/af44a3fb1c4f4998bf174b62d51c19a9">
      <img style="max-width:300px;" src="https://cdn.loom.com/sessions/thumbnails/af44a3fb1c4f4998bf174b62d51c19a9-1690881797687-with-play.gif">
    </a>
</div>
  
[Loom link](https://www.loom.com/share/af44a3fb1c4f4998bf174b62d51c19a9)

## Build/Run the TTYD app

To build/run the app you just need to use the docker file on the root of repo, use it each time you do a change on the project.

```bash
# Build
docker build -t ttyd  -f manual.build.dockerfile .
# Run
docker run --rm -p 7681:7681 -it ttyd
```

## Frontend Development

To do change on the frontend side, you need to work on '/html' directory which is a react app.

```bash
# install dependencies
yarn

# Run
yarn run

# Build
yarn build
```