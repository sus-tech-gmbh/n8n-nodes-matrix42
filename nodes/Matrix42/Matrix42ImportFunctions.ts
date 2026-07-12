import { randomUUID } from 'node:crypto';
import { type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { matrix42ApiRequest } from './GenericFunctions';

export async function executeImportDefinition(this: IExecuteFunctions, i: number) {
	const returnData: IDataObject[] = [];

	const sequenceEoid = this.getNodeParameter('sequenceEoid', i) as string;

	const body = {
		Parameters: [],
		SequenceId: sequenceEoid,
		ActionType: 3, // full execution
		Token: randomUUID(),
	};

	const response = await matrix42ApiRequest.call(
		this,
		'POST',
		'/importdata/executeimportdefinition',
		body,
		{},
	);

	returnData.push(response as IDataObject);

	return returnData;
}
