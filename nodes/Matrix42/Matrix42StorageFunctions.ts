import type {IDataObject, IExecuteFunctions} from "n8n-workflow";
import {matrix42ApiRequest, uuidv4} from "./GenericFunctions";

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

	const typeIdResponse = await matrix42ApiRequest.call(
		this,
		'GET',
		'/data/fragments/SPSCommonClassBase',
		{},
		{
			where: `[Expression-ObjectID] = '${objectId}'`,
			columns: "TypeID as typeId",
		}
	);

	const typeId = typeIdResponse?.[0]?.typeId as string;

	const uniqueFileId = uuidv4();
	const getUploadUrlBody = {
		Name: filename,
		StorageId: storageId,
		TypeId: typeId,
		ObjectId: objectId,
		UniqueFileId: uniqueFileId,
		Size: size
	}

	// get upload url
	await matrix42ApiRequest.call(
		this,
		'POST',
		'/filestorage/getuploadurl',
		getUploadUrlBody,
		{}
	);

	// upload file
	await matrix42ApiRequest.call(
		this,
		'POST',
		'/filestorage/upload',
		fileBuffer as unknown as object,
		{ fileid: uniqueFileId },
		undefined,
		'application/octet-stream'
	);

	// finish upload
	await matrix42ApiRequest.call(
		this,
		'POST',
		`/commonStorage/finishUploading/${uniqueFileId}`,
		{},
		{}
	);

	// add comment
	if(additionalFields.comment && additionalFields.comment.length > 0) {
		await matrix42ApiRequest.call(
			this,
			'POST',
			`/filestorage/comment/${uniqueFileId}`,
			additionalFields.comment as unknown as object,
			{}
		);
	}

	const returnData: IDataObject[] = [{Message: "Success"}];

	return returnData;
}
