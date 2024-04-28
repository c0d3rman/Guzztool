/*
Guzzlords' logger. Use in any file with
```
import log from '@guzzlord/util/log.js';
```
You can use the global logger directly,
or use `log.getLogger('<subtool-id>')` to get a logger for a specific subtool.
*/

import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import chalk from 'chalk';


// Add guzztool prefix and colored subtool prefixes to logs
prefix.reg(log);
prefix.apply(log, {
    format(level, name, timestamp) {
        let output = chalk.bold(`GUZZTOOL ${chalk.gray(`[${timestamp}]`)} ${level}`);
        const subtool = SUBTOOLS.find(s => s.id === name);
        if (subtool) output += ' ' + chalk.hex(subtool.color)(name);
        output += " | ";
        return output;
    },
});

// Set log level based on development/production
__DEV__ ? log.enableAll() : log.setLevel('info');

export default log;