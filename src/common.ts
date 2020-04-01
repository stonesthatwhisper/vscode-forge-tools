import * as vscode from 'vscode';
import * as path from 'path';
import * as pug from 'pug';
import {
    AuthenticationClient,
    DataManagementClient,
    ModelDerivativeClient,
    DesignAutomationClient,
    WebhooksClient,
    BIM360Client,
    IBucket,
    IObject,
    urnify
} from 'forge-server-utils';
import { IDerivative } from './interfaces/model-derivative';
import { IAuthOptions } from 'forge-server-utils/dist/common';

export interface IPreviewSettings {
    extensions: string[];
}

export interface IContext {
    credentials: IAuthOptions;
    extensionContext: vscode.ExtensionContext;
    authenticationClient: AuthenticationClient;
    dataManagementClient: DataManagementClient;
    modelDerivativeClient2L: ModelDerivativeClient; // client for 2-legged workflows
    modelDerivativeClient3L: ModelDerivativeClient; // client for 3-legged workflows
    designAutomationClient: DesignAutomationClient;
    webhookClient: WebhooksClient;
    bim360Client: BIM360Client;
    templateEngine: TemplateEngine;
    previewSettings: IPreviewSettings;
    threeLeggedToken?: string;
}

export class TemplateEngine {
    private _context: vscode.ExtensionContext;
    private _cache: Map<string, pug.compileTemplate>;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._cache = new Map();
    }

    render(templateName: string, data: any): string {
        if (!this._cache.has(templateName)) {
            const templateFolderPath = this._context.asAbsolutePath(path.join('resources', 'templates'));
            const templatePath = path.join(templateFolderPath, templateName + '.pug');
            this._cache.set(templateName, pug.compileFile(templatePath, { basedir: templateFolderPath }));
        }
        const func = this._cache.get(templateName);
        if (!func) {
            throw new Error('Unknown template: ' + templateName);
        }
        return func(data);
    }
}

export async function promptBucket(context: IContext): Promise<IBucket | undefined> {
    const buckets = await context.dataManagementClient.listBuckets();
    const bucketKey = await vscode.window.showQuickPick(buckets.map(item => item.bucketKey), { canPickMany: false, placeHolder: 'Select bucket' });
    if (!bucketKey) {
        return undefined;
    } else {
        return buckets.find(item => item.bucketKey === bucketKey);
    }
}

export async function promptObject(context: IContext, bucketKey: string): Promise<IObject | undefined> {
    const objects = await context.dataManagementClient.listObjects(bucketKey);
    const objectKey = await vscode.window.showQuickPick(objects.map(item => item.objectKey), { canPickMany: false, placeHolder: 'Select object' });
    if (!objectKey) {
        return undefined;
    } else {
        return objects.find(item => item.objectKey === objectKey);
    }
}

export async function promptDerivative(context: IContext, objectId: string): Promise<IDerivative | undefined> {
    const urn = urnify(objectId);
    const manifest = await context.modelDerivativeClient2L.getManifest(urn) as any;
    const svf = manifest.derivatives.find((deriv: any) => deriv.outputType === 'svf');
    if (!svf) {
        vscode.window.showWarningMessage(`No derivatives yet for ${urn}`);
        return undefined;
    }
    const derivatives: IDerivative[] = svf.children.filter((child: any) => child.type === 'geometry').map((geometry: any) => {
        return {
            urn: urn,
            name: geometry.name,
            role: geometry.role,
            guid: geometry.guid,
            bubble: geometry
        };
    });

    const derivativeName = await vscode.window.showQuickPick(derivatives.map(item => item.name), { canPickMany: false, placeHolder: 'Select derivative' });
    if (!derivativeName) {
        return undefined;
    } else {
        return derivatives.find(item => item.name === derivativeName);
    }
}

export async function promptAppBundleFullID(context: IContext): Promise<string | undefined> {
    const appBundles = await context.designAutomationClient.listAppBundles();
    return vscode.window.showQuickPick(appBundles.filter(id => !id.endsWith('$LATEST')), { canPickMany: false, placeHolder: 'Select app bundle' });
}

export async function promptEngine(context: IContext): Promise<string | undefined> {
    const engines = await context.designAutomationClient.listEngines();
    return vscode.window.showQuickPick(engines, { canPickMany: false, placeHolder: 'Select engine' });
}

export function showErrorMessage(title: string, err: any) {
    let msg = title + ': ' + err.message;
    if (err.response) {
        msg += ' (' + JSON.stringify(err.response.data) + ')';
    }
    vscode.window.showErrorMessage(msg);
}

export function stringPropertySorter<T>(propName: keyof T) {
    return function (a: T, b: T): number {
        if (a[propName] < b[propName]) { return -1; }
        else if (a[propName] > b[propName]) { return +1; }
        else { return 0; }
    };
}

export function inHubs(urn: string): boolean {
    return urn.indexOf('_') !== -1;
}