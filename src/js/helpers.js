
export const parseString = (text) => {
    const replacements = ['"', '`', ',']
    const regex = new RegExp(replacements.join('|'), 'g');

    return text.replaceAll(regex, '');
}
