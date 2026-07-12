import { randomUUID } from 'node:crypto';
import { type IDataObject, type IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { escapeAsqlString, matrix42ApiRequest } from './GenericFunctions';

export async function uploadFileToCI(this: IExecuteFunctions, i: number) {
	const filename = this.getNodeParameter('filename', i) as string;
	const storageId = this.getNodeParameter('storageId', i) as string;
	const objectId = this.getNodeParameter('objectId', i) as string;
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as {
		comment?: string;
	};
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

	this.helpers.assertBinaryData(i, binaryPropertyName);
	const fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
	const size = fileBuffer.length;

	const typeIdResponse = (await matrix42ApiRequest.call(
		this,
		'GET',
		'/data/fragments/SPSCommonClassBase',
		{},
		{
			where: `[Expression-ObjectID] = '${escapeAsqlString(objectId)}'`,
			columns: 'TypeID as typeId',
		},
	)) as IDataObject[];

	const typeId = typeIdResponse?.[0]?.typeId as string | undefined;
	if (!typeId) {
		throw new NodeOperationError(
			this.getNode(),
			`No configuration item was found for Object ID "${objectId}"`,
		);
	}

	const uniqueFileId = randomUUID();
	const getUploadUrlBody = {
		Name: filename,
		StorageId: storageId,
		TypeId: typeId,
		ObjectId: objectId,
		UniqueFileId: uniqueFileId,
		Size: size,
	};

	// Register the upload; the server allocates storage for this UniqueFileId.
	// (For external storage providers the response carries a signed URL — uploading there
	// directly is not yet supported and would need an external-provider test instance.)
	await matrix42ApiRequest.call(this, 'POST', '/filestorage/getuploadurl', getUploadUrlBody, {});

	// Upload the bytes to the default endpoint keyed by the unique file ID.
	await matrix42ApiRequest.call(
		this,
		'POST',
		'/filestorage/upload',
		fileBuffer as unknown as object,
		{ fileid: uniqueFileId },
		undefined,
		'application/octet-stream',
	);

	// finish upload
	await matrix42ApiRequest.call(
		this,
		'POST',
		`/commonStorage/finishUploading/${uniqueFileId}`,
		{},
		{},
	);

	// add comment (the endpoint expects the comment as a JSON-encoded string in the body)
	if (additionalFields.comment && additionalFields.comment.length > 0) {
		await matrix42ApiRequest.call(
			this,
			'POST',
			`/filestorage/comment/${uniqueFileId}`,
			JSON.stringify(additionalFields.comment) as unknown as object,
			{},
		);
	}

	const returnData: IDataObject[] = [{ Message: 'Success' }];

	return returnData;
}
