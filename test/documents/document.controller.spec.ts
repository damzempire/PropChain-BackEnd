import { DocumentController } from '../../src/documents/document.controller';
import { DocumentAccessLevel, DocumentType } from '../../src/documents/document.model';
import { DocumentService } from '../../src/documents/document.service';
import { SecureFileValidator } from '../../src/security/validators/secure-file.validator';
import { ConfigService } from '@nestjs/config';

describe('DocumentController', () => {
  const createMockFile = (): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 10,
    buffer: Buffer.from('image'),
    stream: null as unknown as Express.Multer.File['stream'],
    destination: '',
    filename: '',
    path: '',
  });

  it('parses metadata and forwards upload request', async () => {
    const service: Partial<DocumentService> = {
      uploadDocuments: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
    };
    const secureFileValidator: Partial<SecureFileValidator> = {
      validate: jest.fn().mockResolvedValue(undefined),
    };
    const configService: Partial<ConfigService> = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        return defaultValue;
      }),
    };
    
    const controller = new DocumentController(
      service as DocumentService,
      secureFileValidator as SecureFileValidator,
      configService as ConfigService,
    );

    await controller.uploadDocuments(
      [createMockFile()],
      {
        propertyId: 'property-1',
        type: DocumentType.PHOTO,
        title: 'Front',
        tags: 'front, exterior ',
        accessLevel: DocumentAccessLevel.PUBLIC,
        allowedUserIds: 'user-1,user-2',
        allowedRoles: 'AGENT,ADMIN',
        customFields: '{"camera":"sony"}',
      },
      'user-1',
      'AGENT,ADMIN',
    );

    expect(service.uploadDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        propertyId: 'property-1',
        type: DocumentType.PHOTO,
        title: 'Front',
        tags: ['front', 'exterior'],
        accessLevel: DocumentAccessLevel.PUBLIC,
        allowedUserIds: ['user-1', 'user-2'],
        allowedRoles: ['AGENT', 'ADMIN'],
        customFields: { camera: 'sony' },
      }),
      { userId: 'user-1', roles: ['AGENT', 'ADMIN'] },
    );
  });
});
