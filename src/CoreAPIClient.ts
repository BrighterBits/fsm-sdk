import request = require('request-promise-native');
import { v4 as uuid } from 'uuid';
import _crypto = require('crypto');
import fs = require('fs');
import path = require('path');

import { DTOName, DTOModels } from './model/DTOModels';
import { ClientConfig } from './model/ClientConfig';
import { OauthTokenResponse } from './model/OauthTokenResponse';
import { ClientResponse } from './model/ClientResponse';

export class CoreAPIClient {

  private _token: OauthTokenResponse | undefined;
  private _config: ClientConfig = {
    debug: false,

    oauthEndpoint: 'https://ds.coresuite.com/api/oauth2/v1',
    tokenCacheFilePath: undefined,

    clientIdentifier: '<your-clientIdentifier>',
    clientSecret: '<your-clientSecret>',
    clientVersion: '<your-clientVersion>',

    authGrantType: 'password',

    authAccountName: undefined,
    authUserName: undefined,
    authPassword: undefined,
    authCompany: undefined
  }

  /**
   *
   * @param _config ClientConfig {
   *   debug: boolean | undefined;
   *   tokenCacheFilePath: string | undefined;
   *
   *   oauthEndpoint: string;
   *
   *   clientIdentifier: string;
   *   clientSecret: string;
   *   clientVersion: string;
   *
   *   authGrantType: 'password' | 'client_credentials' | undefined
   * 
   *   authAccountName: string | undefined;
   *   authUserName: string | undefined;
   *   authPassword: string | undefined;
   *   authCompany: string | undefined;
   * 
   *  }
   */
  constructor(config: ClientConfig) {
    this._config = Object.assign(this._config, config);
  }

  private _fetchAndSaveToken() {
    const basicAuth = Buffer.from(`${this._config.clientIdentifier}:${this._config.clientSecret}`).toString('base64');
    return this._httpCRUDRequest<string>({
      method: 'POST',
      uri: `${this._config.oauthEndpoint}/token`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
        ...this._getRequestXHeaders()
      },
      form: {
        grant_type: this._config.authGrantType,

        ...(this._config.authGrantType === 'password'
          ? {
            username: `${this._config.authAccountName}/${this._config.authUserName}`,
            password: this._config.authPassword
          }
          : {}
        )
      }
    })
      .then((response: string) => {
        if (this._config.debug && this._config.tokenCacheFilePath) {
          fs.writeFileSync(this._config.tokenCacheFilePath, response);
        }
        return JSON.parse(response);
      });
  };

  private _readToken(): Promise<OauthTokenResponse> {
    return new Promise<OauthTokenResponse>((resolve, fail) => {
      if (this._config.debug && this._config.tokenCacheFilePath) {
        return resolve(require(path.resolve(this._config.tokenCacheFilePath)))
      }
      fail({ code: 'MODULE_NOT_FOUND' });
    })
      .catch(error => {
        if (error.code === 'MODULE_NOT_FOUND') {
          return this._fetchAndSaveToken()
        }
        throw error;
      });
  };

  private _ensureToken(): Promise<OauthTokenResponse> {
    return this._token
      ? Promise.resolve(this._token)
      : this._readToken()
        .then(token => this.setToken(token).getToken() as OauthTokenResponse);
  };

  private ALL_DTO_VERSIONS: { [name: string]: number } = {
    'Activity': 31,
    'ActivitySubType': 14,
    'Approval': 13,
    'Attachment': 16,
    'Address': 17,
    'BusinessPartner': 20,
    'BusinessPartnerGroup': 14,
    'BusinessProcessStepDefinition': 15,
    'ChecklistInstance': 17,
    'ChecklistInstanceElement': 13,
    'ChecklistCategory': 10,
    'ChecklistTemplate': 17,
    'ChecklistTag': 8,
    'ChecklistVariable': 8,
    'Currency': 11,
    'CustomRule': 8,
    'Contact': 16,
    'CompanyInfo': 15,
    'CompanySettings': 11,
    'EmployeeBranch': 9,
    'EmployeeDepartment': 9,
    'EmployeePosition': 9,
    'Enumeration': 11,
    'Equipment': 18,
    'Expense': 15,
    'ExpenseType': 15,
    'FieldConfiguration': 8,
    'Filter': 12,
    'Function': 8,
    'Group': 13,
    'Icon': 8,
    'Item': 21,
    'ItemGroup': 10,
    'ItemPriceListAssignment': 14,
    'Material': 18,
    'Mileage': 16,
    'MileageType': 14,
    'PaymentTerm': 14,
    'Person': 18,
    'PersonReservation': 15,
    'PersonReservationType': 15,
    'PersonWorkTimePattern': 8,
    'Plugin': 8,
    'Project': 10,
    'ProjectPhase': 10,
    'PriceList': 14,
    'ProfileObject': 22,
    'ReportTemplate': 15,
    'Requirement': 8,
    'Region': 9,
    'ReservedMaterial': 16,
    'ScreenConfiguration': 8,
    'ServiceAssignment': 25,
    'ServiceAssignmentStatus': 12,
    'ServiceAssignmentStatusDefinition': 14,
    'ServiceCall': 24,
    'Shift': 8,
    'ShiftTechnician': 8,
    'Skill': 8,
    'Team': 8,
    'TeamTimeFrame': 8,
    'Tag': 8,
    'Tax': 9,
    'TimeEffort': 15,
    'TimeTask': 16,
    'TimeSubTask': 14,
    'Translation': 8,
    'UdfMeta': 13,
    'UdfMetaGroup': 10,
    'UserSyncConfirmation': 13,
    'Warehouse': 15,
    'WorkTimeTask': 15,
    'WorkTimePattern': 8,
    'WorkTime': 15,
    'CrowdBusinessPartner': 8,
    'CrowdAssignment': 8,
    'Notification': 8,
    'CrowdExecutionRecord': 8,
    'CrowdPerson': 8,
    'UnifiedPerson': 8
  };

  private _getVersionsParam(DTONames: DTOName[]): string {
    return DTONames
      .map(name => {
        if (!this.ALL_DTO_VERSIONS[name]) {
          throw new Error(`no DTO version found for ${name}`);
        }
        return `${name}.${this.ALL_DTO_VERSIONS[name]}`;
      }).join(';');
  }

  private _getRequestXHeaders() {
    return {
      'X-Client-Id': this._config.clientIdentifier,
      'X-Client-Version': this._config.clientVersion,
      'X-Request-ID': _crypto.randomBytes(16).toString('hex')
    }
  }

  private _getRequestHeaders(token: OauthTokenResponse) {
    return {
      'Authorization': `${token.token_type} ${token.access_token}`,
      'Accept': 'application/json',
      ...this._getRequestXHeaders()
    }
  }

  private _getRequestAccountQueryParams(token: OauthTokenResponse) {
    if (!token.companies || !token.companies.length) {
      throw new Error('no compnay found on given account');
    }

    const [selectedCompany] = token.companies;

    return {
      account: this._config.authAccountName,
      user: this._config.authUserName,
      company: this._config.authCompany ? this._config.authCompany : selectedCompany.name,
    }
  }


  private _httpCRUDRequest<T>(opt: request.Options) {
    if (this._config.debug) {
      console.log(`[httpRequest] outgoing options[${JSON.stringify(opt, null, 2)}]`);
    }
    return request(opt)
      .then(response => {
        if (this._config.debug) {
          console.log(`[httpRequest] incoming going options[${JSON.stringify(opt, null, 2)}] response[${JSON.stringify(response, null, 2)}]`);
        }
        return response as T;
      });
  }

  private _DataApiCRUDRequest<T extends DTOModels>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    resourceName: DTOName,
    resource: T | null | any,
    resourceId: string | null = null,
    additionalQs: { [k: string]: string | number | boolean } = {}
  ) {
    return this._ensureToken()
      .then(token => this._httpCRUDRequest({
        method,
        uri: `${token.cluster_url}/api/data/v4/${resourceName}${(resourceId ? `/${resourceId}` : '')}`,
        headers: this._getRequestHeaders(token),
        qs: Object.assign({},
          this._getRequestAccountQueryParams(token),
          method !== 'DELETE' ? { dtos: this._getVersionsParam([resourceName]) } : undefined,
          additionalQs),
        json: resource
      }));
  }

  /**
  * returns a uuid that can be used as object id
  */
  public static createUUID(): string {
    return uuid().replace(/\-/g, '').toUpperCase();
  }

  /**
   * Here, you can input and execute the CoreSQL query.
   * @param coreSQL
   * @param resourceNames
   */
  public query<T>(coreSQL: string, resourceNames: DTOName[]): Promise<ClientResponse<T>> {
    return this._ensureToken()
      .then(token => this._httpCRUDRequest(
        {
          method: 'POST',
          uri: `${token.cluster_url}/api/query/v1`,
          headers: this._getRequestHeaders(token),
          qs: {
            ... this._getRequestAccountQueryParams(token),
            dtos: this._getVersionsParam(resourceNames)
          },
          json: { query: coreSQL }
        })) as Promise<ClientResponse<T>>;
  }

  /**
   * Retrieving Lists of Objects
   * @param resourceName resourceName
   * @param resourceId uuid
   */
  public getById<T extends DTOModels>(resourceName: DTOName, resourceId: string): Promise<ClientResponse<T>> {
    return this._DataApiCRUDRequest('GET', resourceName, null, resourceId)
      .then(response => typeof response === 'string' ? JSON.parse(response) : response); // not sending json headers
  }

  public deleteById<T extends Partial<DTOModels>>(resourceName: DTOName, resource: { id: string, lastChanged: number }): Promise<undefined> {
    const { id, lastChanged } = resource;
    return this._DataApiCRUDRequest('DELETE', resourceName, null, id, { lastChanged }) as any as Promise<undefined>;
  }

  /**
   * Creating Objects
   * @param resourceName resourceName
   * @param resource should contain in the body the ENTIRE updated resource
   */
  public post<T extends DTOModels>(resourceName: DTOName, resource: T): Promise<ClientResponse<T>> {
    return this._DataApiCRUDRequest('POST', resourceName, resource) as Promise<ClientResponse<T>>;
  }

  /**
   * Updating Existing Objects
   * @param resourceName resourceName
   * @param resource should contain in the body the ENTIRE updated resource
   */
  public put<T extends DTOModels>(resourceName: DTOName, resource: T): Promise<ClientResponse<T>> {
    const { id } = resource;
    return this._DataApiCRUDRequest('PUT', resourceName, resource, id) as Promise<ClientResponse<T>>;
  }

  /**
   * Updating Existing Objects
   * should contain in the body the entire updated resource
   * @param resourceName resourceName
   * @param resource should contain in the body the FIELDS THAT YOU WANT TO UPDATE
   */
  public patch<T extends Partial<DTOModels>>(resourceName: DTOName, resource: T): Promise<ClientResponse<T>> {
    const { id } = resource;
    return this._DataApiCRUDRequest('PATCH', resourceName, resource, id) as Promise<ClientResponse<T>>;
  }

  public getToken(): Readonly<OauthTokenResponse> | undefined {
    return this._token;
  }

  public setToken(token: OauthTokenResponse): CoreAPIClient {

    if (!token || !token.account) {
      throw new Error('invalid token');
    }

    this._token = token;
    return this;
  }

}
