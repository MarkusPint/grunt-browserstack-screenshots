# grunt-browserstack-screenshots

> Generate screenshots of a local or a live site via BrowserStack Screenshots API; report to Slack or generate a local HTML report file.

## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-browserstack-screenshots --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks( "grunt-browserstack-screenshots" );
```

## The "screenshots" task

### Overview
In your project's Gruntfile, add a section named `screenshots` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  screenshots: {
    task: {
      options: {
        bsUser: "<your BrowserStack user>",
        bsKey: "<your BrowserStack key>",
        local: false, // Set to true, if testing a local site
        launchTunnel: true, // Set to true, if you are testing a local site and not setting up a tunnel yourself
        reportDir: "tmp", // Specify a directory for the HTML report, alternatively specify slackWebhook
        slackWebhook: "<Your Slack webhook URL>", // Specify instead of reportDir, if you want to report to Slack
        projectTitle: "<Project name>", // Displayed in the report
        baseUrl: "<The URL of the site you want to screenshot>",
        routes: [ "/", "/about" ], // The routes of the site you want to screenshot
        browsers: [] // BrowserStack browsers option; passed directly to BrowserStack
      }
    }
  }
})
```

## Release History
- 0.0.1 Initial publish
- 0.0.2 Proof of concept
- 0.0.3 Improved error logging
- 0.0.8 Slack/HTML reporting
- 0.1.0 NPM metadata improvement