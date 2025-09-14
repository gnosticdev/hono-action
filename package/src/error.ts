/**
 * Standard error codes for actions
 */
export type ActionErrorCode =
    | 'INPUT_VALIDATION_ERROR'
    | 'EXTERNAL_API_ERROR'
    | 'INTERNAL_SERVER_ERROR'
    | 'UNKNOWN_ERROR'
    | 'LOCATION_NOT_FOUND'
    | 'SESSION_NOT_FOUND'

export class HonoActionError<
    TMessage extends string,
    TCode extends ActionErrorCode,
    TIssue = any,
> extends Error {
    code: TCode
    issue?: TIssue
    constructor({
        message,
        code,
        issue,
    }: { message: TMessage; code: TCode; issue?: TIssue }) {
        super(message)
        this.name = 'HonoActionError'
        this.code = code
        this.issue = issue
    }
}
