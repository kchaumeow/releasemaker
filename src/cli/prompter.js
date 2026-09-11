import readline from 'node:readline/promises';

const YES = ['y', 'yes'];
const NO = ['n', 'no'];

export const createPrompter = ({ input, output }) => {
    const readlineInterface = readline.createInterface({ input, output });

    const askText = async (question, defaultValue) => {
        const answer = (await readlineInterface.question(`${question} [${defaultValue}]: `)).trim();
        if (answer === '') {
            return defaultValue;
        }
        return answer;
    };

    const askValidated = async (question, defaultValue, check) => {
        for (;;) {
            const answer = await askText(question, defaultValue);
            const error = check(answer);
            if (error === undefined) {
                return answer;
            }
            output.write(`${error}\n`);
        }
    };

    const confirm = async (question, defaultYes) => {
        let hint = '(y/N)';
        if (defaultYes) {
            hint = '(Y/n)';
        }
        for (;;) {
            const answer = (await readlineInterface.question(`${question} ${hint} `)).trim().toLowerCase();
            if (answer === '') {
                return defaultYes;
            }
            if (YES.includes(answer)) {
                return true;
            }
            if (NO.includes(answer)) {
                return false;
            }
            output.write('Please answer y or n.\n');
        }
    };

    const choose = async (question, options, describe) => {
        output.write(`${question}\n`);
        options.forEach((option, index) => output.write(`  ${index + 1}) ${describe(option)}\n`));
        for (;;) {
            const answer = (await readlineInterface.question(`Choice [1-${options.length}]: `)).trim();
            const index = Number.parseInt(answer, 10) - 1;
            if (Number.isInteger(index) && index >= 0 && index < options.length) {
                return options[index];
            }
            output.write(`Please enter a number between 1 and ${options.length}.\n`);
        }
    };

    const close = () => readlineInterface.close();

    return { askText, askValidated, confirm, choose, close };
};
