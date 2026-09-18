import type {
  GarmentGroup,
  GarmentGroupMember,
  GarmentGroupConfirmationStatus,
  GarmentRelationshipType,
} from '../constants/types'

// Supabase rows are untyped JSON at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbRowToGarmentGroupMember(row: any): GarmentGroupMember {
  return {
    userId: row.user_id,
    groupId: row.group_id,
    garmentId: row.garment_id,
    createdAt: row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbRowToGarmentGroup(row: any): GarmentGroup {
  const memberRows = row.garment_group_members ?? row.members ?? []
  return {
    id: row.id,
    userId: row.user_id,
    relationshipType: row.relationship_type as GarmentRelationshipType,
    relationshipConfidence: row.relationship_confidence ?? undefined,
    confirmationStatus: row.confirmation_status as GarmentGroupConfirmationStatus,
    sharedAttributes: row.shared_attributes ?? {},
    sourceImagePath: row.source_image_path ?? undefined,
    members: memberRows.map(mapDbRowToGarmentGroupMember),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}