export const meta = {
  purpose:
    "What the code offers that no documentation file names: package.json scripts and bins, Cargo binaries, Make targets, environment variables the code reads (process.env, env::var, os.environ, getenv), command-line flags and subcommands found in files that parse arguments (commander, yargs, parseArgs, clap, argparse, cobra, a switch on argv). Each with where it is defined. Best effort: it cannot see configuration keys, and a flag found in a parser file may be one the program passes to another tool, so read the `where` before saying it is missing.",
  params: {
    repo: "another repository to check, by path, optional (default: the one the agent works in)",
    kind: "only these kinds: script, bin, make, just, env, flag, subcommand (default all)",
    max: "undocumented names per kind, default 25",
  },
  returns: "{docs, <kind>: {detected, undocumentedCount, undocumented:[{name, where}], cut?}, detectedFrom, notDetected}",
  example: 'await scripts.run("undocumented", { kind: ["env", "flag"] })',
};

export default async function undocumented({ docs: root }, { repo, kind, max = 25 } = {}) {
  const docs = repo ? root.at(repo) : root;
  return docs.inventory({ kind, max });
}
