Console Watch
-------------

Run commands frequently on the console and collect the results. It is kinda like
cron but for shorter durations, and commands that only ever return numbers.

Inspired by AWS CloudWatch

## Usage

Create a `settings.json` file like which contains a array of objects, each with 
a `name` and `command` attribute. For example:

    [
        {
            "name": "TCP Connections",
            "command": "ss -t -a | wc -l"
        },
        {
            "name": "Error long length",
            "command": "wc -l /var/log/my-errors.log"
        }
    ]

To run these to commands every 10 seconds do:

    $> ./index.js --config settings.json --frequency 10

## Options

    --config        Configuration file. Default is `settings.json`.

    --verbose       Verbose output.

    --frequency     How often to run the commands in seconds. Defaults to 30

    --samples       The number of samples to collect, omit to run until killed. 

    --out           File to write the results to (as JSON).
