import { Command } from 'commander';
import fs from 'fs';
import https from 'follow-redirects';
import { tmpdir } from 'os';
import zlib from 'zlib';
import tar from 'tar';
import { pipeline } from 'stream';
import { join } from 'path';
import { setFailed } from '@actions/core';
import yaml from 'js-yaml';

async function downloadFileToTemp(url: string): Promise<string> {
  const tempFile = join(tmpdir(), `${Math.random().toString(16).substring(2)}_dictionaries.tar.gz`);

  return new Promise((resolve, reject) => {
    https.https.get(url, (res) => {
      const fileStream = fs.createWriteStream(tempFile);
      res.pipe(fileStream)
        .on('finish', () => {
          fileStream.close();
          resolve(tempFile);
      });
    });
  });
}

async function decompressTarGz(tarGzFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    return fs.promises.mkdir(join(tmpdir(), Math.random().toString(16).substring(2)), { recursive: true })
      .then((destinationFolder) => {
        fs.createReadStream(tarGzFilePath)
          .on('error', (err) => reject(err))
          .pipe(zlib.createGunzip({finishFlush: zlib.constants.Z_SYNC_FLUSH}))
          .on('error', (err) => reject(err))
          .pipe(tar.x({ cwd: destinationFolder }))
          .on('error', (err) => reject(err))
          .on('finish', () => resolve(destinationFolder));
      });
  });
}

async function readYamlToDictionary(yamlFilePath: string): Promise<{ mapping: Array<Array<string>> }> {
  return fs.promises.readFile(yamlFilePath, 'utf-8')
    .then((fileContents) => yaml.load(fileContents) as { mapping: Array<Array<string>> })
}

const program = new Command();
program.name('update-aosp-dictionaries')
  .description('CLI to update AOSP gz aosp wordlists').version('0.0.1');

program
  .command('update')
  .requiredOption('--repository_root <root_path>', 'Path to the repository root folder')
  .requiredOption('--dictionaries_archive <http_url>', 'URL to download the archive')
  .requiredOption('--dictionaries_mapping <path>', 'Path mapping file')
  .action(async (options) => {
    console.log(`Downloading archive from ${options.dictionaries_archive}...`);
    await downloadFileToTemp(options.dictionaries_archive)
      .then((archive_file) => {
        console.log(`Decompressing ${archive_file}...`);
        return decompressTarGz(archive_file);
      })
      .then((dictionaries_folder) => {
        console.log(`Dictionaries available at ${dictionaries_folder}.`);
        console.log(`Reading file mapping from ${options.dictionaries_mapping}...`);
        return readYamlToDictionary(options.dictionaries_mapping)
          .then((data) => data.mapping)
          .then((mappings) => {
            for (var mapping of mappings) {
              var src = `${dictionaries_folder}/${mapping[0]}`;
              var trgt = `${options.repository_root}/${mapping[1]}`;
              console.log(` - copying ${src} to ${trgt}`)
              fs.copyFileSync(src, trgt);
            }
          })
      })

})

const main = async () => {
  program.parse();
};

main().catch((err) => setFailed(err.message));