// Remotion's settings for the studio and the CLI renders.
// See https://www.remotion.dev/docs/config
import { Config } from "@remotion/cli/config"

Config.setEntryPoint("src/index.ts")
// JPEG frames render faster than PNG; the game's flat black and white
// survives the quality below.
Config.setVideoImageFormat("jpeg")
Config.setJpegQuality(95)
Config.setOverwriteOutput(true)
