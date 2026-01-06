import * as url from 'url';
import * as path from 'path';
import { Construct } from 'constructs';
import { StaticWebsite } from '../../core/index.js';

export class Frontend extends StaticWebsite {
  constructor(scope: Construct, id: string) {
    // 컴파일된 위치에서 프로젝트 루트까지 상대 경로
    const currentDir = url.fileURLToPath(new URL('.', import.meta.url));
    const projectRoot = path.resolve(
      currentDir,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
    );
    const bundlePath = path.join(
      projectRoot,
      'dist',
      'packages',
      'frontend',
      'bundle',
    );

    super(scope, id, {
      websiteName: 'Frontend',
      websiteFilePath: bundlePath,
    });
  }
}
